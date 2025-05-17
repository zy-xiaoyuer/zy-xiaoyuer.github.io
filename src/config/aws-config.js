export const awsConfig = {
    region: 'us-east-1',                                           // AWS区域
    bucketName: 'pictures-family-0424',                            // S3存储桶名称
    apiGatewayUrl: 'https://4m0in950ua.execute-api.us-east-1.amazonaws.com/direct',  // 原有API Gateway URL
    albumApiUrl: 'https://4m0in950ua.execute-api.us-east-1.amazonaws.com/direct',  // 修正相册API URL，使用同一个endpoint
    albumsTable: 'Albums',                                         // DynamoDB相册表名
    photosTable: 'PhotoMetadata'                                   // DynamoDB照片表名
};








