import { Router } from 'express';
import { ResponseController } from '../modules/responses/response.controller';
import { videoUpload } from '../middlewares/upload.middleware';

const router = Router();

router.post(
  '/upload',
  videoUpload.single('video'),
  ResponseController.upload
);

router.get(
  '/:id/status',
  ResponseController.getStatus
);

router.post(
  '/session/:token/submit',
  ResponseController.submitInterview
);

router.post(
  '/:id/process',
  ResponseController.process
);

export default router;
