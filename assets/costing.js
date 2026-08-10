/* All money math lives here. The AI never computes or invents these numbers —
   it only receives the finished totals to narrate around. */

function memberLineCost(m) {
  const hrs = (Number(m.hoursMapping) || 0) + (Number(m.hoursImplementation) || 0) + (Number(m.hoursHypercare) || 0);
  return hrs * (Number(m.costPerHour) || 0);
}

function toolLineCost(t) {
  const price = t.cycle === 'yearly' ? t.yearly : t.monthly;
  if (price == null) return 0;
  return price * (Number(t.qty) || 0);
}

function computeCosting() {
  const team = STATE.team.filter(m => m.included);
  const tools = STATE.tools.filter(t => t.included);

  const stageMapping = team.reduce((s, m) => s + (Number(m.hoursMapping) || 0) * (Number(m.costPerHour) || 0), 0);
  const stageImplementation = team.reduce((s, m) => s + (Number(m.hoursImplementation) || 0) * (Number(m.costPerHour) || 0), 0);
  const stageHypercare = team.reduce((s, m) => s + (Number(m.hoursHypercare) || 0) * (Number(m.costPerHour) || 0), 0);
  const implementationTotal = stageMapping + stageImplementation + stageHypercare;

  const toolsMonthlyTotal = tools.filter(t => t.cycle === 'monthly').reduce((s, t) => s + toolLineCost(t), 0);
  const toolsYearlyTotal = tools.filter(t => t.cycle === 'yearly').reduce((s, t) => s + toolLineCost(t), 0);
  const licenceAnnualTotal = toolsYearlyTotal + toolsMonthlyTotal * 12;

  const gstPct = Number(STATE.settings.gstPercent) || 0;
  const gstAmount = implementationTotal * (gstPct / 100);
  const implementationWithGst = implementationTotal + gstAmount;

  const pctAdvance = Number(STATE.settings.pctAdvance) || 0;
  const pctSignoff = Number(STATE.settings.pctSignoff) || 0;
  const pctGolive = Number(STATE.settings.pctGolive) || 0;
  const mappingFee = stageMapping;
  const postMappingPool = stageImplementation + stageHypercare;

  const payment = {
    advance: mappingFee * (pctAdvance / 100),
    signoff: postMappingPool * (pctSignoff / 100),
    golive: postMappingPool * (pctGolive / 100)
  };

  return {
    team,
    tools,
    stages: {
      mapping: stageMapping,
      implementation: stageImplementation,
      hypercare: stageHypercare
    },
    implementationTotal,
    toolsMonthlyTotal,
    toolsYearlyTotal,
    licenceAnnualTotal,
    gstPct,
    gstAmount,
    implementationWithGst,
    payment
  };
}

function fmtMoney(n) {
  const sym = STATE.settings.currencySymbol || 'Rs.';
  const rounded = Math.round((Number(n) || 0));
  return sym + ' ' + rounded.toLocaleString('en-IN');
}
