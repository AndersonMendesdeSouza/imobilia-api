import { v2 as cloudinary } from 'cloudinary';

export function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv === 'production') {
    if (!cloudName) {
      throw new Error('Variável cloudName não encotrada!');
    }
    if (!apiKey) {
      throw new Error('Variável apiKey não encotrada!');
    }
    if (!apiSecret) {
      throw new Error('Variável apiSecret não encotrada!');
    }
  }
  console.log(apiKey)

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}
