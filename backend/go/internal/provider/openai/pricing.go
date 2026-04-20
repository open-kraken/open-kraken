package openai

// Per-million-token USD prices. Unknown models return 0 — CWS treats
// that as "no cost observation" and does not penalise the arm.
//
// Source: public OpenAI pricing page, captured on first implementation.
// Keep the table minimal and explicit; prefer to leave a model out than
// invent a price.
type price struct {
	inputPerM  float64
	outputPerM float64
}

var priceTable = map[string]price{
	// GPT-4o family.
	"gpt-4o":          {2.5, 10.0},
	"gpt-4o-2024-08-06": {2.5, 10.0},
	"gpt-4o-mini":      {0.15, 0.6},

	// o1 reasoning family (rough published numbers — adjust per account).
	"o1":      {15.0, 60.0},
	"o1-mini": {3.0, 12.0},

	// Legacy 4-turbo still in circulation.
	"gpt-4-turbo": {10.0, 30.0},
}

func costUSD(model string, in, out int) float64 {
	p, ok := priceTable[model]
	if !ok {
		return 0
	}
	return (float64(in)*p.inputPerM + float64(out)*p.outputPerM) / 1_000_000.0
}
