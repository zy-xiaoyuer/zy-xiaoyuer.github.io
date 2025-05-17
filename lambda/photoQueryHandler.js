import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  BatchGetCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';

// 初始化 DynamoDB 客户端
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event) => {
  console.log('照片查询请求:', JSON.stringify(event, null, 2));

  // 设置CORS头
  const origin = event.headers && (event.headers.Origin || event.headers.origin) || '*';

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
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS enabled' })
    };
  }

  try {
    // 只处理GET请求
    if (event.httpMethod !== 'GET') {
      throw new Error(`不支持的HTTP方法: ${event.httpMethod}`);
    }

    const queryParams = event.queryStringParameters || {};

    // 根据查询参数处理不同的查询
    if (queryParams.ids) {
      // 根据ID列表查询照片
      return await getPhotosByIds(queryParams.ids.split(','), headers);
    } else if (queryParams.albumId) {
      // 根据相册ID查询照片
      return await getPhotosByAlbumId(queryParams.albumId, headers);
    } else {
      // 获取所有照片或按条件筛选
      return await getPhotos(queryParams, headers);
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

// 根据ID列表获取照片
async function getPhotosByIds(photoIds, headers) {
  if (!photoIds || photoIds.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: '缺少照片ID'
      })
    };
  }

  // 使用BatchGet获取多个照片
  const keys = photoIds.map(id => ({ photoId: id }));

  const result = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [process.env.PHOTOS_TABLE || 'PhotoMetadata']: {
        Keys: keys
      }
    }
  }));

  const photos = result.Responses?.[process.env.PHOTOS_TABLE || 'PhotoMetadata'] || [];

  // 返回照片列表
  return {
    statusCode: 200,
    headers, // 确保包含CORS头
    body: JSON.stringify({
      success: true,
      photos
    })
  };
}

// 根据相册ID获取照片
async function getPhotosByAlbumId(albumId, headers) {
  console.log('根据相册ID获取照片:', albumId);
  
  try {
    // 首先获取相册信息，以获取photoIds
    const albumResult = await docClient.send(new GetCommand({
      TableName: process.env.ALBUMS_TABLE || 'Albums',
      Key: { albumId }
    }));
    
    const album = albumResult.Item;
    console.log('获取到的相册信息:', album);
    
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
      console.log('使用photoIds获取照片:', album.photoIds);
      
      const keys = album.photoIds.map(id => ({ photoId: id }));
      
      const result = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [process.env.PHOTOS_TABLE || 'PhotoMetadata']: {
            Keys: keys
          }
        }
      }));
      
      const photos = result.Responses?.[process.env.PHOTOS_TABLE || 'PhotoMetadata'] || [];
      console.log('获取到的照片:', photos);
      
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
    console.log('使用albumId查询照片');
    
    const queryResult = await docClient.send(new ScanCommand({
      TableName: process.env.PHOTOS_TABLE || 'PhotoMetadata',
      FilterExpression: 'albumId = :albumId',
      ExpressionAttributeValues: {
        ':albumId': albumId
      }
    }));
    
    console.log('查询结果:', queryResult);
    
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

// 获取所有照片或按条件筛选
async function getPhotos(queryParams, headers) {
  const params = {
    TableName: process.env.PHOTOS_TABLE || 'PhotoMetadata'
  };

  // 构建过滤表达式
  let filterExpressions = [];
  let expressionAttributeValues = {};

  // 按相册类型筛选
  if (queryParams.albumType) {
    filterExpressions.push('albumType = :albumType');
    expressionAttributeValues[':albumType'] = queryParams.albumType;
  }

  // 按分类筛选
  if (queryParams.category) {
    filterExpressions.push('category = :category');
    expressionAttributeValues[':category'] = queryParams.category;
  }

  // 按日期筛选
  if (queryParams.photoDate) {
    filterExpressions.push('photoDate = :photoDate');
    expressionAttributeValues[':photoDate'] = queryParams.photoDate;
  }

  // 如果有过滤条件，添加到查询参数
  if (filterExpressions.length > 0) {
    params.FilterExpression = filterExpressions.join(' AND ');
    params.ExpressionAttributeValues = expressionAttributeValues;
  }

  // 从DynamoDB获取照片
  const result = await docClient.send(new QueryCommand(params));

  // 返回照片列表
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      photos: result.Items || []
    })
  };
}



