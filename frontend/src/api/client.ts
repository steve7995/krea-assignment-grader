import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 60000, // 60s — grading can take up to 15s+
  headers: { 'Content-Type': 'application/json' },
});

export default api;
