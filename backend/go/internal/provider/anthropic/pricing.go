package anthropic

// priceTable is the per-million-token USD price used to compute
// Completion.Usage.CostUSD. Keep this short and explicit — we would
// rather return 0 for an unrecognised model than invent a price.
//
// Source: public Anthropic pricing page, captured on first implementation.
// When models are renamed / retired this table is the single point to
// update. The table is intentionally not exposed outside the package.
type price struct {
	inputPerM  float64
	outputPerM float64
}

var priceTable = map[string]price{
	// Claude 4.x family.
	"claude-opus-4-7":   {15.0, 75.0},
	"claude-opus-4-6":   {15.0, 75.0},
	"claude-sonnet-4-6": {3.0, 15.0},
	"claude-haiku-4-5":  {1.0, 5.0},

	// Legacy 3.x family still in circulation.
	"claude-3-5-sonnet-20241022": {3.0, 15.0},
	"claude-3-5-haiku-20241022":  {0.8, 4.0},
}

// costUSD computes a best-effort dollar cost. Returns 0 for unknown
// models rather than guessing.
func costUSD(model string, in, out int) float64 {
	p, ok := priceTable[model]
	if !ok {
		return 0
	}
	return (float64(in)*p.inputPerM + float64(out)*p.outputPerM) / 1_000_000.0
}
