import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: 'us-east-1'
});

export const handler = async (event) => {
    console.log('收到请求:', JSON.stringify(event, null, 2));

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

    // 处理 OPTIONS 请求
    if (event.httpMethod === 'OPTIONS') {
        console.log('处理OPTIONS预检请求');
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS enabled' })
        };
    }

    // 如果是PUT请求，直接处理文件上传
    if (event.httpMethod === 'PUT') {
        try {
            // 检查内容类型
            const contentType = event.headers['Content-Type'] || event.headers['content-type'];
            
            // 如果是JSON格式的请求，处理base64编码的文件内容
            if (contentType && contentType.includes('application/json')) {
                console.log('处理JSON格式的请求');
                // 解析JSON请求体
                const body = JSON.parse(event.body);
                console.log('请求体解析成功:', {
                    fileName: body.fileName,
                    fileType: body.fileType,
                    fileContentLength: body.fileContent ? body.fileContent.length : 0
                });
                
                const { fileName, fileType, fileContent } = body;
                
                if (!fileName || !fileType || !fileContent) {
                    throw new Error('缺少必要参数：fileName、fileType或fileContent');
                }
                
                // 检查存储桶名称是否设置
                if (!process.env.S3_BUCKET) {
                    throw new Error('未设置 S3_BUCKET 环境变量');
                }
                
                // 解码base64内容
                const fileBuffer = Buffer.from(fileContent, 'base64');
                
                // 设置S3对象参数
                const key = `uploads/${Date.now()}-${fileName}`;
                const params = {
                    Bucket: process.env.S3_BUCKET,
                    Key: key,
                    Body: fileBuffer,
                    ContentType: fileType
                };
                
                // 上传到S3前记录日志
                console.log('准备上传到S3:', {
                    Bucket: params.Bucket,
                    Key: params.Key,
                    ContentType: params.ContentType
                });
                
                // 上传到S3
                try {
                    await s3Client.send(new PutObjectCommand(params));
                    console.log('S3上传成功');
                } catch (s3Error) {
                    console.error('S3上传失败:', s3Error);
                    throw s3Error;
                }
                
                // 返回成功响应
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        key: key,
                        url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`
                    })
                };
            } 
            // 原有的二进制上传处理逻辑保持不变
            else {
                // 从查询参数获取文件名和类型
                const queryParams = event.queryStringParameters || {};
                const fileName = queryParams.fileName;
                const fileType = queryParams.fileType;
                
                if (!fileName || !fileType) {
                    throw new Error('缺少必要参数：fileName 或 fileType');
                }

                // 检查存储桶名称是否设置
                if (!process.env.S3_BUCKET) {
                    throw new Error('未设置 S3_BUCKET 环境变量');
                }

                // 设置S3对象参数
                const key = `uploads/${Date.now()}-${fileName}`;
                const params = {
                    Bucket: process.env.S3_BUCKET,
                    Key: key,
                    Body: Buffer.from(event.body, 'base64'), // API Gateway可能会以base64编码传递二进制数据
                    ContentType: fileType
                };

                // 直接上传到S3
                await s3Client.send(new PutObjectCommand(params));

                // 返回成功响应
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        key: key,
                        url: `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`
                    })
                };
            }
        } catch (error) {
            console.error('上传错误:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    error: error.message || '服务器错误'
                })
            };
        }
    }

    // 原有的POST请求处理逻辑（生成预签名URL）
    try {
        // 解析请求体
        const body = JSON.parse(event.body);
        const { fileName, fileType } = body;

        // 检查必要参数
        if (!fileName || !fileType) {
            throw new Error('缺少必要参数：fileName 或 fileType');
        }

        // 检查存储桶名称是否设置
        if (!process.env.S3_BUCKET) {
            throw new Error('未设置 S3_BUCKET 环境变量');
        }

        // 设置S3对象参数
        const params = {
            Bucket: process.env.S3_BUCKET,
            Key: `uploads/${Date.now()}-${fileName}`,
            ContentType: fileType
        };

        // 使用新的 getSignedUrl API
        const command = new PutObjectCommand(params);
        const uploadURL = await getSignedUrl(s3Client, command, {
            expiresIn: 300
        });

        // 返回成功响应，包含预签名URL和文件键
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                uploadURL,
                key: params.Key
            })
        };
    } catch (error) {
        console.error('详细错误信息:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: error.message || '服务器错误'
            })
        };
    }
};



