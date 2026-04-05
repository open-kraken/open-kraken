package role

import "errors"

var ErrInvalidRole = errors.New("role is invalid")

type Name string

const (
	Owner      Name = "owner"
	Supervisor Name = "supervisor"
	Assistant  Name = "assistant"
	Member     Name = "member"
)

type Policy struct {
	Name             Name
	CanManageMembers bool
	CanAssignRoles   []Name
	CanModerateChat  bool
	CanOperateAgent  bool
	CanManageRoadmap bool
	CanWriteProject  bool
}

func (n Name) Validate() error {
	switch n {
	case Owner, Supervisor, Assistant, Member:
		return nil
	default:
		return ErrInvalidRole
	}
}

func (n Name) Rank() int {
	switch n {
	case Owner:
		return 4
	case Supervisor:
		return 3
	case Assistant:
		return 2
	case Member:
		return 1
	default:
		return 0
	}
}

func (n Name) Includes(required Name) bool {
	if err := n.Validate(); err != nil {
		return false
	}
	if err := required.Validate(); err != nil {
		return false
	}
	return n.Rank() >= required.Rank()
}

func (n Name) Policy() (Policy, error) {
	if err := n.Validate(); err != nil {
		return Policy{}, err
	}
	switch n {
	case Owner:
		return Policy{
			Name:             n,
			CanManageMembers: true,
			CanAssignRoles:   []Name{Owner, Supervisor, Assistant, Member},
			CanModerateChat:  true,
			CanOperateAgent:  true,
			CanManageRoadmap: true,
			CanWriteProject:  true,
		}, nil
	case Supervisor:
		return Policy{
			Name:             n,
			CanManageMembers: true,
			CanAssignRoles:   []Name{Assistant, Member},
			CanModerateChat:  true,
			CanOperateAgent:  true,
			CanManageRoadmap: true,
			CanWriteProject:  true,
		}, nil
	case Assistant:
		return Policy{
			Name:             n,
			CanManageMembers: false,
			CanAssignRoles:   nil,
			CanModerateChat:  false,
			CanOperateAgent:  true,
			CanManageRoadmap: true,
			CanWriteProject:  true,
		}, nil
	case Member:
		return Policy{
			Name:             n,
			CanManageMembers: false,
			CanAssignRoles:   nil,
			CanModerateChat:  false,
			CanOperateAgent:  false,
			CanManageRoadmap: false,
			CanWriteProject:  false,
		}, nil
	default:
		return Policy{}, ErrInvalidRole
	}
}

func (n Name) CanAssign(target Name) bool {
	policy, err := n.Policy()
	if err != nil {
		return false
	}
	for _, candidate := range policy.CanAssignRoles {
		if candidate == target {
			return true
		}
	}
	return false
}
