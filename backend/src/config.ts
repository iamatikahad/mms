import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4001),
  db: {
    user: process.env.DB_USER || 'MESS_APP',
    password: process.env.DB_PASSWORD || '',
    connectString: process.env.DB_CONNECT_STRING || '//localhost:1521/MNC',
    poolMin: 1,
    poolMax: 10,
    poolIncrement: 1,
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresHours: Number(process.env.JWT_EXPIRES_HOURS || 12),
  cookieName: 'mess_token',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: 5 * 1024 * 1024,
  timezone: 'Asia/Dhaka',
  currency: 'BDT',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};
