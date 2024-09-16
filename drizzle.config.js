import dotenv from 'dotenv';
dotenv.config();

export default {
  schema: './schema.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
