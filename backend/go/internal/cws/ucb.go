package cws

import "math"

// DefaultExplorationC is the value of c in the UCB-1 formula. sqrt(2) is
// the canonical choice analysed in Auer et al. (2002) and the value
// assumed by the paper's regret-bound proof (Proposition 5.1).
var DefaultExplorationC = math.Sqrt2

// Scored pairs a candidate Arm with its UCB score for the current tick.
type Scored struct {
	Arm   Arm
	Score float64
}

// ucbScore returns the UCB-1 value for a single arm given the total pulls
// across the candidate set and the exploration coefficient c. An arm
// that has never been pulled gets +∞ so exploration visits every arm at
// least once before exploitation begins.
func ucbScore(arm Arm, totalPulls int64, c float64) float64 {
	if arm.Pulls <= 0 {
		return math.Inf(+1)
	}
	if totalPulls <= 0 {
		return arm.Mean()
	}
	return arm.Mean() + c*math.Sqrt(math.Log(float64(totalPulls))/float64(arm.Pulls))
}

// score each arm and pick the maximum. Ties are broken by iteration
// order — the caller controls ordering when stability matters.
//
// Returns the index of the winner in `arms`, the score, and the fully
// ranked list. An empty `arms` returns (-1, 0, nil).
func pickByUCB(arms []Arm, c float64) (int, float64, []Scored) {
	if len(arms) == 0 {
		return -1, 0, nil
	}
	var total int64
	for _, a := range arms {
		total += a.Pulls
	}
	ranked := make([]Scored, len(arms))
	winner := 0
	var bestScore float64 = math.Inf(-1)
	for i, a := range arms {
		s := ucbScore(a, total, c)
		ranked[i] = Scored{Arm: a, Score: s}
		if s > bestScore {
			bestScore = s
			winner = i
		}
	}
	return winner, bestScore, ranked
}
