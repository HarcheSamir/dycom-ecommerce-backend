

import { Router } from 'express';
import { searchContentCreators, recordProfileVisit, searchRegions, getCreatorById  } from './content-creator.controller';

const router = Router();

// Route for getting the authenticated user's full profile
// This route must be protected by your authentication middleware
router.post('/search', searchContentCreators);
router.get('/regions', searchRegions);

// Route for updating the authenticated user's password
// This route must also be protected by your authentication middleware
router.get('/:creatorId/visit', recordProfileVisit);
router.get('/:creatorId', getCreatorById);

export default router;