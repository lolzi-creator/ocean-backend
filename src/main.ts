import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Increase payload size for file uploads
  app.use(json({ limit: '50mb' }));
  
  // Enable CORS for frontend
  app.enableCors({
    origin: [
      'http://localhost:5173',  // Vite dev server (ocean-frontend)
      'http://localhost:3000',  // Next.js website (ocean-maintenance)
      'http://localhost:3001',  // Alternate port
      'https://ocean-car.ch',   // Production website
      'https://www.ocean-car.ch', // Production website with www
      'https://app.ocean-car.ch', // Production software
      'https://api.ocean-car.ch', // API itself
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
}
bootstrap();
