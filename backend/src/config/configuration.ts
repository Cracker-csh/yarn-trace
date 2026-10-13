export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/yarntrace?schema=public',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'yarntrace_super_secure_access_secret_token_2026_key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'yarntrace_super_secure_refresh_secret_token_2026_key',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    allowTunnelOrigins: process.env.ALLOW_TUNNEL_ORIGINS !== 'false',
  },
});
