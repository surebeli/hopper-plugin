import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ rows: [], totals: {}, byVendor: [] });
});

export default router;
