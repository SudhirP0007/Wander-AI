const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const itineraryRoutes = require('./routes/itineraries');
const recommendationRoutes = require('./routes/recommendations');
const budgetRoutes = require('./routes/budget');
const weatherRoutes = require('./routes/weather');
const mapRoutes = require('./routes/map');
const adminRoutes = require('./routes/admin');
const preferencesRoutes = require('./routes/preferences');
const exportRoutes = require('./routes/export');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Basic rate limiting to protect auth + AI-generation endpoints from abuse.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', env: env.nodeEnv }));

app.use('/api/auth', authRoutes);
app.use('/api/itineraries', itineraryRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/export', exportRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WanderAI backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
});
