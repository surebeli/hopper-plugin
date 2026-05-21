import { Router } from 'express';

const router = Router();

router.get('/queue', (_req, res) => {
  res.json({ items: [] });
});

export default router;
