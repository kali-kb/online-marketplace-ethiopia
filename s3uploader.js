import AWS from 'aws-sdk';

// const S3_BUCKET = 'your-bucket-name';
// const REGION = 'your-region';

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_ACCESS_SECRET_KEY,
    region: process.env.AWS_REGION,
});

const myBucket = new AWS.S3({
    params: { Bucket: process.env.AWS_BUCKET },
    region: process.env.AWS_REGION,
});



const uploadFile = async (fileUrl) => {
    try {
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const fileKey = `product_images/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

        const params = {
            Body: buffer,
            Bucket: process.env.AWS_BUCKET,
            Key: fileKey,
            ContentType: 'image/jpeg',
            ContentDisposition: 'inline',
        };

        return new Promise((resolve, reject) => {
            myBucket.putObject(params).send((err) => {
                if (err) {
                    console.log(err);
                    reject(err);
                } else {
                    const fileUrl = `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
                    console.log('File uploaded successfully at:', fileUrl);
                    resolve(fileUrl);
                }
            });
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
};

export default uploadFile;
