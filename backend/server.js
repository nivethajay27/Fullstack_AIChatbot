import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg';
import cors from 'cors';
import { WebSocketServer } from 'ws'; 

import routes from './routes.js';

const { Pool } = pg;

const app = express(); 
const PORT = process.env.PORT || 8080;


app.use(bodyParser.json());
app.use(cors()); 

// Set up PostgreSQL connection
const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'chatbot_db',
    password: 'ashlyndales',
    port: 5432,
});

app.use((req, res, next) => {
  req.pool = pool;
  next();
});

// Routes
app.use('/api', routes);
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).send('Server error');
  });
  
// Start server
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// WebSocket server setup
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    console.log('Received message:', message);

    // Handle the received message, process it, and send a response
    const data = JSON.parse(message);
    if (data.type === 'chat') {
     
      const response = { type: 'chat', text: `AI Response to: ${data.text}` };
      ws.send(JSON.stringify(response));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});
