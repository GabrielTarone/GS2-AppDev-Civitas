require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const connectDatabase = require('./config/database');
const port = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    await connectDatabase(process.env.MONGODB_URI);
    const server = app.listen(port, () => console.log(`Civitas disponível em http://localhost:${port}`));
    server.on('error', async error => {
      const detail = error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso.` : error.message;
      console.error(`Não foi possível iniciar o servidor: ${detail}`);
      await mongoose.disconnect();
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(`Não foi possível conectar ao MongoDB: ${error.message}`);
    console.error('Confira se o serviço está ativo e se MONGODB_URI está configurada no arquivo .env.');
    process.exitCode = 1;
  }
}

startServer();
