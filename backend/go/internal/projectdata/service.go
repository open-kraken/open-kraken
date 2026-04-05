package projectdata

import "open-kraken/backend/go/internal/authz"

type GuardedService struct {
	repo       ProjectDataRepository
	authorizer authz.Service
}

func NewGuardedService(repo ProjectDataRepository) GuardedService {
	return GuardedService{
		repo:       repo,
		authorizer: authz.NewService(),
	}
}

func (s GuardedService) WriteProjectData(ctx authz.AuthContext, req ReadRequest, doc ProjectDataDocument, opts WriteOptions) (WriteResult[ProjectDataDocument], error) {
	ctx.WorkspaceID = req.WorkspaceID
	ctx.Action = authz.ActionProjectDataWrite
	if err := s.authorizer.Enforce(ctx); err != nil {
		return WriteResult[ProjectDataDocument]{}, err
	}
	return s.repo.WriteProjectData(req, doc, opts)
}

func (s GuardedService) WriteConversationRoadmap(ctx authz.AuthContext, req ReadRequest, doc ConversationRoadmapDocument, opts WriteOptions) (WriteResult[ConversationRoadmapDocument], error) {
	ctx.WorkspaceID = req.WorkspaceID
	ctx.ConversationID = req.ConversationID
	ctx.Action = authz.ActionRoadmapWrite
	if err := s.authorizer.Enforce(ctx); err != nil {
		return WriteResult[ConversationRoadmapDocument]{}, err
	}
	return s.repo.WriteConversationRoadmap(req, doc, opts)
}

func (s GuardedService) WriteGlobalRoadmap(ctx authz.AuthContext, req ReadRequest, doc GlobalRoadmapDocument, opts WriteOptions) (WriteResult[GlobalRoadmapDocument], error) {
	ctx.WorkspaceID = req.WorkspaceID
	ctx.Action = authz.ActionRoadmapWrite
	if err := s.authorizer.Enforce(ctx); err != nil {
		return WriteResult[GlobalRoadmapDocument]{}, err
	}
	return s.repo.WriteGlobalRoadmap(req, doc, opts)
}
