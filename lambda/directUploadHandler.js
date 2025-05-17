// 导入必要的依赖
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  ScanCommand, 
  QueryCommand,
  GetCommand,
  BatchGetCommand
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

// 初始化DynamoDB客户端
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// 初始化S3客户端
const s3Client = new S3Client({ region: 'us-east-1' });

export const handler = async (event) => {
  console.log('收到直接上传请求');
  console.log('完整事件对象:', JSON.stringify(event, null, 2));

  // 设置CORS头
  // 获取请求的来源
  const origin = event.headers && (event.headers.Origin || event.headers.origin);
  console.log('请求来源:', origin);

  // 设置允许的来源 - 使用实际的来源而不是通配符
  const allowedOrigin = origin || 'https://staging.dsbv6c2bq4kma.amplifyapp.com';

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  };

  // 处理OPTIONS请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS enabled' })
    };
  }

  try {
    // 检查是否是获取相册列表的请求
    if (event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.action === 'getAlbums') {
      return await getAlbumsList(event, headers);
    }
    
    // 添加获取单个相册详情的功能
    if (event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.action === 'getAlbum') {
      const albumId = event.queryStringParameters.id;
      if (!albumId) {
        throw new Error('缺少相册ID');
      }
      return await getAlbumById(albumId, headers);
    }
    
    // 添加获取相册照片的功能
    if (event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.action === 'getAlbumPhotos') {
      const albumId = event.queryStringParameters.id;
      if (!albumId) {
        throw new Error('缺少相册ID');
      }
      return await getPhotosByAlbumId(albumId, headers);
    }
    
    // 添加获取所有照片的功能
    if (event.httpMethod === 'GET' && event.queryStringParameters && event.queryStringParameters.action === 'getAllPhotos') {
      return await getAllPhotos(headers);
    }

    // 尝试从不同位置获取请求体
    let requestBody = event.body;

    // 如果event.body是字符串但不是JSON，可能是base64编码
    if (event.isBase64Encoded && typeof requestBody === 'string') {
      requestBody = Buffer.from(requestBody, 'base64').toString('utf-8');
      console.log('解码base64后的请求体:', requestBody);
    }

    // 如果请求体为空，尝试从event本身获取数据
    if (!requestBody) {
      console.log('请求体为空，尝试从event对象获取数据');
      if (event.fileName && event.fileType && event.fileContent) {
        requestBody = JSON.stringify({
          fileName: event.fileName,
          fileType: event.fileType,
          fileContent: event.fileContent,
          metadata: event.metadata
        });
      } else {
        throw new Error('无法获取上传数据');
      }
    }

    // 解析请求体
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { fileName, fileType, fileContent, metadata } = body;

    // 检查action字段，确定要执行的操作
    const { action } = body;

    // 处理照片上传
    if (action === 'uploadPhoto') {
      if (!fileName || !fileType || !fileContent) {
        throw new Error('缺少必要参数：fileName、fileType或fileContent');
      }

      // 解码base64内容
      const fileBuffer = Buffer.from(fileContent, 'base64');

      // 设置S3对象参数
      const key = `uploads/${Date.now()}-${fileName}`;
      const params = {
        Bucket: process.env.S3_BUCKET || 'pictures-family-0424',
        Key: key,
        Body: fileBuffer,
        ContentType: fileType,
        // 添加公共读取权限
        ACL: 'public-read'
      };

      console.log('准备上传到S3:', {
        Bucket: params.Bucket,
        Key: params.Key,
        ContentType: params.ContentType
      });

      // 上传到S3
      await s3Client.send(new PutObjectCommand(params));
      console.log('S3上传成功');

      // 构造S3 URL
      const url = `https://${params.Bucket}.s3.amazonaws.com/${key}`;

      // 如果有元数据，保存到DynamoDB
      if (metadata) {
        try {
          console.log('准备保存元数据:', JSON.stringify(metadata, null, 2));

          // 生成唯一ID
          const photoId = uuidv4(); // 使用UUID而不是文件名，避免重复

          // 准备DynamoDB项目
          const dynamoParams = {
            TableName: process.env.PHOTOS_TABLE || 'PhotoMetadata',
            Item: {
              photoId: photoId,
              s3Key: key,
              url: url,
              fileName: fileName,
              fileType: fileType,
              albumId: metadata.albumId || '', // 添加相册ID字段
              albumType: metadata.albumType || '',
              category: metadata.category || '',
              photoDate: metadata.photoDate || '',
              tags: metadata.tags || [],
              description: metadata.description || '',
              createdAt: new Date().toISOString()
            }
          };

          // 存储到DynamoDB
          await docClient.send(new PutCommand(dynamoParams));

          // 在照片上传成功后，添加相册创建功能
          if (metadata && metadata.createAlbum) {
            try {
              console.log('准备创建相册:', JSON.stringify(metadata, null, 2));
              
              // 生成唯一ID
              const albumId = uuidv4();
              const timestamp = new Date().toISOString();
              
              // 准备相册数据
              const albumItem = {
                albumId,
                title: metadata.albumTitle || (metadata.category ? `我的${metadata.category}相册` : '新相册'),
                description: metadata.albumDescription || '',
                albumType: metadata.albumType || 'theme',
                category: metadata.category || '',
                photoDate: metadata.photoDate || '',
                coverImageUrl: url,
                photoIds: [photoId],
                tags: metadata.tags || [],
                createdAt: timestamp,
                updatedAt: timestamp
              };
              
              // 存储到DynamoDB
              await docClient.send(new PutCommand({
                TableName: process.env.ALBUMS_TABLE || 'Albums',
                Item: albumItem
              }));
              
              console.log('相册创建成功:', albumId);
              
              // 获取所有相册列表，以便前端更新
              const allAlbums = await getAllAlbums(albumItem.albumType);
              
              // 在响应中包含相册信息和所有相册列表
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  success: true,
                  key: key,
                  url: url,
                  photoId: photoId,
                  albumId: albumId,
                  album: albumItem,
                  allAlbums: allAlbums // 添加所有相册列表
                })
              };
            } catch (albumError) {
              console.error('创建相册失败:', albumError);
              // 即使相册创建失败，照片上传仍然成功
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  success: true,
                  key: key,
                  url: url,
                  photoId: photoId,
                  error: '照片上传成功，但创建相册失败: ' + albumError.message
                })
              };
            }
          }

          // 返回成功响应，包含photoId
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              key: key,
              url: url,
              photoId: photoId // 返回photoId给前端
            })
          };
        } catch (error) {
          console.error('保存元数据失败:', error);
          // 即使元数据保存失败，我们仍然继续返回成功上传的响应
        }
      }

      // 返回成功响应
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          key: key,
          url: url
        })
      };
    } else {
      throw new Error(`未知的操作: ${action}`);
    }
  } catch (error) {
    console.error('处理错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || '服务器错误'
      })
    };
  }
};

// 获取相册列表的处理函数
async function getAlbumsList(event, headers) {
  try {
    // 从查询参数获取相册类型
    const queryParams = event.queryStringParameters || {};
    const albumType = queryParams.type || 'theme';
    
    // 获取相册列表
    const albums = await getAllAlbums(albumType);
    
    // 返回成功响应
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        albums: albums
      })
    };
  } catch (error) {
    console.error('获取相册列表失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || '获取相册列表失败'
      })
    };
  }
}

// 获取所有相册的辅助函数
async function getAllAlbums(albumType = 'theme') {
  // 准备查询参数
  const params = {
    TableName: process.env.ALBUMS_TABLE || 'Albums'
  };
  
  // 如果指定了相册类型，添加过滤表达式
  if (albumType) {
    params.FilterExpression = 'albumType = :albumType';
    params.ExpressionAttributeValues = {
      ':albumType': albumType
    };
  }
  
  console.log(`查询相册类型: ${albumType}, 参数:`, JSON.stringify(params));
  
  // 执行查询
  const result = await docClient.send(new ScanCommand(params));
  
  console.log(`获取到 ${result.Items ? result.Items.length : 0} 个 ${albumType} 类型的相册`);
  
  // 返回相册列表
  return result.Items || [];
}

// 添加获取单个相册详情的函数
async function getAlbumById(albumId, headers) {
  try {
    // 从DynamoDB获取相册
    const result = await docClient.send(new GetCommand({
      TableName: process.env.ALBUMS_TABLE || 'Albums',
      Key: { albumId }
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: '相册不存在'
        })
      };
    }

    // 返回相册信息
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        album: result.Item
      })
    };
  } catch (error) {
    console.error('获取相册详情失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || '获取相册详情失败'
      })
    };
  }
}

// 添加获取相册照片的函数
async function getPhotosByAlbumId(albumId, headers) {
  try {
    // 首先获取相册信息，以获取photoIds
    const albumResult = await docClient.send(new GetCommand({
      TableName: process.env.ALBUMS_TABLE || 'Albums',
      Key: { albumId }
    }));
    
    const album = albumResult.Item;
    
    if (!album) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: '相册不存在'
        })
      };
    }
    
    // 如果相册中有photoIds，使用BatchGet获取这些照片
    if (album.photoIds && album.photoIds.length > 0) {
      const keys = album.photoIds.map(id => ({ photoId: id }));
      
      const result = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [process.env.PHOTOS_TABLE || 'PhotoMetadata']: {
            Keys: keys
          }
        }
      }));
      
      const photos = result.Responses?.[process.env.PHOTOS_TABLE || 'PhotoMetadata'] || [];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          photos
        })
      };
    }
    
    // 如果相册中没有photoIds，尝试使用查询通过albumId查找照片
    const queryResult = await docClient.send(new ScanCommand({
      TableName: process.env.PHOTOS_TABLE || 'PhotoMetadata',
      FilterExpression: 'albumId = :albumId',
      ExpressionAttributeValues: {
        ':albumId': albumId
      }
    }));
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        photos: queryResult.Items || []
      })
    };
  } catch (error) {
    console.error('获取相册照片失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '获取相册照片失败: ' + error.message
      })
    };
  }
}

// 添加获取所有照片的函数
async function getAllPhotos(headers) {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: process.env.PHOTOS_TABLE || 'PhotoMetadata'
    }));
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        photos: result.Items || []
      })
    };
  } catch (error) {
    console.error('获取所有照片失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '获取所有照片失败: ' + error.message
      })
    };
  }
}


