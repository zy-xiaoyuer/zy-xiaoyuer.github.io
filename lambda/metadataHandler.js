import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (event) => {
    console.log('收到元数据请求:', JSON.stringify(event, null, 2));

    // 获取请求的来源
    const origin = event.headers && (event.headers.Origin || event.headers.origin) || '*';
    console.log('请求来源:', origin);

    // 设置CORS头，允许跨域请求
    const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
    };

    // 处理 OPTIONS 请求（CORS 预检请求）
    if (event.httpMethod === 'OPTIONS') {
        console.log('处理元数据OPTIONS预检请求');
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS enabled' })
        };
    }

    try {
        // 解析请求体
        const metadata = JSON.parse(event.body);

        // 检查必要参数
        if (!metadata.photoId && !metadata.id) {
            // 如果没有提供photoId，使用id或生成一个新的
            metadata.photoId = metadata.id || `${Date.now()}-${metadata.fileName || 'unknown'}`;
        }

        // 准备DynamoDB项目
        const params = {
            TableName: process.env.DYNAMODB_TABLE || 'PhotoMetadata',
            Item: {
                photoId: metadata.photoId,  // 确保使用photoId作为主键
                ...metadata,
                createdAt: new Date().toISOString()
            }
        };

        // 删除多余的id字段，避免重复
        if (params.Item.id && params.Item.id !== params.Item.photoId) {
            delete params.Item.id;
        }

        // 存储到DynamoDB
        await docClient.send(new PutCommand(params));

        // 返回成功响应
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '元数据保存成功',
                id: metadata.photoId
            })
        };
    } catch (error) {
        console.error('详细错误信息:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
        });

        // 返回错误响应
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: error.message || '服务器错误'
            })
        };
    }
};
