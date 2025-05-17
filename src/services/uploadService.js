import { awsConfig } from '../config/aws-config.js';

export class UploadService {
  static async uploadPhoto(file, metadata, albumInfo = null) {
    try {
      console.log('开始上传文件:', file.name, file.type, file.size);
      
      // 将文件转换为base64编码
      const base64File = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });
      
      // 合并相册信息到元数据
      const enhancedMetadata = {
        ...metadata,
        // 如果提供了相册信息，添加createAlbum标志和相册数据
        ...(albumInfo && {
          createAlbum: true,
          albumTitle: albumInfo.title || '',
          albumDescription: albumInfo.description || '',
          tags: albumInfo.tags || []
        })
      };
      
      const requestBody = JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileContent: base64File,
        metadata: enhancedMetadata,
        action: 'uploadPhoto'
      });
      
      // 使用直接上传路由
      const uploadUrl = `${awsConfig.apiGatewayUrl}/upload-direct`;
      console.log('发送请求到:', uploadUrl, '使用方法:', 'PUT');
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        },
        credentials: 'same-origin',
        body: requestBody
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`上传失败: ${uploadResponse.status} - ${errorText}`);
      }
      
      const result = await uploadResponse.json();
      
      return {
        success: true,
        url: result.url,
        key: result.key,
        photoId: result.photoId || `${Date.now()}-${file.name}`,
        albumId: result.albumId,
        album: result.album,
        allAlbums: result.allAlbums, // 添加所有相册列表
        metadata: enhancedMetadata
      };
    } catch (error) {
      console.error('上传错误:', error);
      throw error;
    }
  }
  
  // 添加获取相册列表的方法
  static async getAlbums(type = 'theme') {
    try {
      const apiUrl = `${awsConfig.apiGatewayUrl}/upload-direct?action=getAlbums&type=${type}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        }
      });
      
      if (!response.ok) {
        throw new Error(`获取相册列表失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error('获取相册列表失败: ' + (data.error || '未知错误'));
      }
      
      return data.albums || [];
    } catch (error) {
      console.error('获取相册列表错误:', error);
      throw error;
    }
  }
}


























