import { createAssociationHandlers, defaultAssociationDependencies } from '@/lib/observatory/project-association-route';
export const POST=createAssociationHandlers(defaultAssociationDependencies).POST;
