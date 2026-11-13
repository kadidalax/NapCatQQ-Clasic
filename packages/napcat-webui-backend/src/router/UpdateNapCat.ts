/**
 * @file UpdateNapCat路由
 */

import { Router } from 'express';
import { UpdateNapCatHandler } from '@/napcat-webui-backend/src/api/UpdateNapCat';

const router: Router = Router();

// Legacy endpoint: returns a frozen error and never modifies the runtime.
router.post('/update', UpdateNapCatHandler);

export { router as UpdateNapCatRouter };
