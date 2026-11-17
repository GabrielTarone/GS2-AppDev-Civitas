const express = require('express');
const path = require('path');
const occurrenceRoutes = require('./routes/occurrenceRoutes');
const configRoutes = require('./routes/configRoutes');
const healthRoutes = require('./routes/healthRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/occurrences', occurrenceRoutes);
app.use('/api/config', configRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
