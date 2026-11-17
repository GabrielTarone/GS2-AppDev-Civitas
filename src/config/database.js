const mongoose = require('mongoose');

async function connectDatabase(uri) {
  if (!uri) throw new Error('A variável MONGODB_URI não foi configurada.');
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`MongoDB conectado ao database "${mongoose.connection.name}".`);
}

module.exports = connectDatabase;
