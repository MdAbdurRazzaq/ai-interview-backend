import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT: number = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
