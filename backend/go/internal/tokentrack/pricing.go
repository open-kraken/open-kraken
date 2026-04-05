package tokentrack

// ModelPricing maps model IDs to [inputCostPerToken, outputCostPerToken] in USD.
// Costs are per-token values with 8 decimal places precision.
var ModelPricing = map[string][2]float64{
	"claude-sonnet-4-6": {0.000003, 0.000015}, // input/output per token in USD
	"claude-opus-4-6":   {0.000015, 0.000075},
	"claude-haiku-4-5":  {0.0000008, 0.000004},
}

// ComputeCost calculates the cost in USD for the given model and token counts.
// Returns 0 if the model is not in the pricing table.
func ComputeCost(model string, inputTokens, outputTokens int64) float64 {
	pricing, ok := ModelPricing[model]
	if !ok {
		return 0
	}
	return float64(inputTokens)*pricing[0] + float64(outputTokens)*pricing[1]
}
