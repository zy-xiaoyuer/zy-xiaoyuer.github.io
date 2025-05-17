import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand // 确保导入ScanCommand
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// 初始化 DynamoDB 客户端
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event) => {
  console.log('相册处理请求:', JSON.stringify(event, null, 2));

  // 设置CORS头 - 修改这里
  const origin = event.headers && (event.headers.Origin || event.headers.origin) || 'https://staging.dsbv6c2bq4kma.amplifyapp.com';
  // 允许特定来源
  const headers = {
    'Access-Control-Allow-Origin': origin, // 使用实际的来源
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    'Access-Control-Max-Age': '86400'
  };

  // 处理OPTIONS请求
  if (event.httpMethod === 'OPTIONS') {
    console.log('处理OPTIONS预检请求');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS enabled' })
    };
  }

  try {
    // 根据HTTP方法处理不同的请求
    if (event.httpMethod === 'POST') {
      // 创建新相册
      return await createAlbum(event, headers);
    } else if (event.httpMethod === 'GET') {
      // 获取相册信息
      const albumId = event.pathParameters?.albumId;
      if (albumId) {
        // 获取单个相册详情
        return await getAlbumById(albumId, headers);
      } else {
        // 获取相册列表
        return await getAlbums(event, headers);
      }
    } else if (event.httpMethod === 'PUT') {
      // 更新相册
      const albumId = event.pathParameters?.albumId;
      if (!albumId) {
        throw new Error('缺少相册ID');
      }
      return await updateAlbum(albumId, event, headers);
    } else if (event.httpMethod === 'DELETE') {
      // 删除相册
      const albumId = event.pathParameters?.albumId;
      if (!albumId) {
        throw new Error('缺少相册ID');
      }
      return await deleteAlbum(albumId, headers);
    } else {
      throw new Error(`不支持的HTTP方法: ${event.httpMethod}`);
    }
  } catch (error) {
    console.error('处理错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || '服务器错误'
      })
    };
  }
};

// 创建新相册
async function createAlbum(event, headers) {
  // 解析请求体
  const albumData = JSON.parse(event.body);

  // 验证必要字段
  if (!albumData.title) {
    throw new Error('相册标题不能为空');
  }

  // 生成唯一ID
  const albumId = uuidv4();
  const timestamp = new Date().toISOString();

  // 准备DynamoDB项目
  const item = {
    albumId,
    title: albumData.title,
    description: albumData.description || '',
    albumType: albumData.albumType || 'theme',
    category: albumData.category || '',
    photoDate: albumData.photoDate || '',
    coverImageUrl: albumData.coverImageUrl || '',
    photoIds: albumData.photoIds || [],
    tags: albumData.tags || [],
    createdAt: timestamp,
    updatedAt: timestamp
  };

  // 存储到DynamoDB
  await docClient.send(new PutCommand({
    TableName: process.env.ALBUMS_TABLE || 'Albums',
    Item: item
  }));

  // 如果有照片ID，更新照片的albumId字段
  if (item.photoIds && item.photoIds.length > 0) {
    await updatePhotosAlbumId(item.photoIds, albumId);
  }

  // 返回成功响应
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({
      success: true,
      message: '相册创建成功',
      albumId,
      album: item
    })
  };
}

// 获取单个相册详情
async function getAlbumById(albumId, headers) {
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
}

// 获取相册列表
async function getAlbums(event, headers) {
  console.log('获取相册列表，查询参数:', event.queryStringParameters);
  
  // 构建查询参数
  const params = {
    TableName: process.env.ALBUMS_TABLE || 'Albums'
  };
  
  // 如果指定了类型，添加过滤条件
  if (event.queryStringParameters && event.queryStringParameters.type) {
    const albumType = event.queryStringParameters.type;
    console.log('按类型过滤相册:', albumType);
    
    // 使用FilterExpression过滤特定类型的相册
    params.FilterExpression = 'albumType = :albumType';
    params.ExpressionAttributeValues = {
      ':albumType': albumType
    };
  }
  
  try {
    console.log('执行DynamoDB查询，参数:', JSON.stringify(params, null, 2));
    
    // 从DynamoDB获取相册列表
    const result = await docClient.send(new ScanCommand(params));
    console.log('查询结果:', JSON.stringify(result, null, 2));
    
    // 返回相册列表
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        albums: result.Items || []
      })
    };
  } catch (error) {
    console.error('获取相册列表失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: '获取相册列表失败: ' + error.message
      })
    };
  }
}

// 更新相册
async function updateAlbum(albumId, event, headers) {
  // 解析请求体
  const albumData = JSON.parse(event.body);

  // 验证相册是否存在
  const existingAlbum = await docClient.send(new GetCommand({
    TableName: process.env.ALBUMS_TABLE || 'Albums',
    Key: { albumId }
  }));

  if (!existingAlbum.Item) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        error: '相册不存在'
      })
    };
  }

  // 准备更新表达式
  let updateExpression = 'SET updatedAt = :updatedAt';
  const expressionAttributeValues = {
    ':updatedAt': new Date().toISOString()
  };

  // 添加要更新的字段
  const fields = [
    'title', 'description', 'albumType', 'category',
    'photoDate', 'coverImageUrl', 'tags'
  ];

  fields.forEach(field => {
    if (albumData[field] !== undefined) {
      updateExpression += `, ${field} = :${field}`;
      expressionAttributeValues[`:${field}`] = albumData[field];
    }
  });

  // 处理photoIds字段（如果是添加新照片）
  if (albumData.addPhotoIds && albumData.addPhotoIds.length > 0) {
    // 获取现有的photoIds
    const existingPhotoIds = existingAlbum.Item.photoIds || [];

    // 合并并去重
    const newPhotoIds = [...new Set([...existingPhotoIds, ...albumData.addPhotoIds])];

    updateExpression += ', photoIds = :photoIds';
    expressionAttributeValues[':photoIds'] = newPhotoIds;

    // 更新照片的albumId字段
    await updatePhotosAlbumId(albumData.addPhotoIds, albumId);
  }

  // 更新DynamoDB中的相册
  await docClient.send(new UpdateCommand({
    TableName: process.env.ALBUMS_TABLE || 'Albums',
    Key: { albumId },
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues
  }));

  // 返回成功响应
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: '相册更新成功',
      albumId
    })
  };
}

// 删除相册
async function deleteAlbum(albumId, headers) {
  // 从DynamoDB删除相册
  await docClient.send(new DeleteCommand({
    TableName: process.env.ALBUMS_TABLE || 'Albums',
    Key: { albumId }
  }));

  // 返回成功响应
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: '相册删除成功'
    })
  };
}

// 更新照片的albumId字段
async function updatePhotosAlbumId(photoIds, albumId) {
  // 批量更新照片的albumId字段
  const promises = photoIds.map(photoId => {
    return docClient.send(new UpdateCommand({
      TableName: process.env.PHOTOS_TABLE || 'PhotoMetadata',
      Key: { photoId },
      UpdateExpression: 'SET albumId = :albumId',
      ExpressionAttributeValues: {
        ':albumId': albumId
      }
    }));
  });

  // 等待所有更新完成
  await Promise.all(promises);
}










