import { Router } from 'express';

const router = Router();

router.post('/probe', (_req, res) => {
  res.status(501).json({ error: 'probe action arrives in T-WEB-06' });
});

export default router;
