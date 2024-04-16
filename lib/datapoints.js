class Datapoints {

	static AllParams =
		[
			{
				Datapoint: "_sum/State",
				Name: "State",
				Description: "Zustand des Systems",
				States: {
					0: "OK",
					1: "Info",
					2: "Warning",
					3: "Fault"
				}
			},
			{
				Datapoint: "_sum/EssSoc",
				Name: "Soc",
				Description: "Ladezustand des Speichers"
			},
			{
				Datapoint: "_sum/EssActivePower",
				Name: "ActivePower",
				Description: "Wirkleistung des Speichers"
			},
			{
				Datapoint: "_sum/GridActivePower",
				Name: "GridActivePower",
				Description: "Wirkleistung am Netzanschlusspunkt"
			},
			{
				Datapoint: "_sum/ProductionActivePower",
				Name: "ProductionActivePower",
				Description: "Wirkleistung Erzeuger"
			},
			{
				Datapoint: "_sum/ProductionAcActivePower",
				Name: "ProductionAcActivePower",
				Description: "Wirkleistung AC Erzeuger"
			},
			{
				Datapoint: "_sum/ProductionDcActualPower",
				Name: "ProductionDcActualPower",
				Description: "Wirkleistung DC Erzeuger"
			},
			{
				Datapoint: "_sum/ConsumptionActivePower",
				Name: "ConsumptionActivePower",
				Description: "Wirkleistung Verbraucher"
			},
			{
				Datapoint: "_sum/EssActiveChargeEnergy",
				Name: "ActiveChargeEnergy",
				Description: "Energie Speicherbeladung"
			},
			{
				Datapoint: "_sum/EssActiveDischargeEnergy",
				Name: "ActiveDischargeEnergy",
				Description: "Energie Speicherentladung"
			},
			{
				Datapoint: "_sum/GridBuyActiveEnergy",
				Name: "GridBuyActiveEnergy",
				Description: "Energie Netzbezug"
			},
			{
				Datapoint: "_sum/GridSellActiveEnergy",
				Name: "GridSellActiveEnergy",
				Description: "Energie Netzeinspeisung"
			},
			{
				Datapoint: "_sum/ProductionActiveEnergy",
				Name: "ProductionActiveEnergy",
				Description: "Energie Erzeugung"
			},
			{
				Datapoint: "_sum/ProductionAcActiveEnergy",
				Name: "ProductionAcActiveEnergy",
				Description: "Energie AC Erzeugung"
			},
			{
				Datapoint: "_sum/ProductionDcActiveEnergy",
				Name: "ProductionDcActiveEnergy",
				Description: "Energie DC Erzeugung"
			},
			{
				Datapoint: "_sum/ConsumptionActiveEnergy",
				Name: "ConsumptionActiveEnergy",
				Description: "Energie Verbraucher"
			},
			{
				Datapoint: "_sum/EssActivePowerL1",
				Name: "ActivePowerL1",
				Description: "Wirkleistung Phase 1 Speicher"
			},
			{
				Datapoint: "_sum/EssActivePowerL2",
				Name: "ActivePowerL2",
				Description: "Wirkleistung Phase 2 Speicher"
			},
			{
				Datapoint: "_sum/EssActivePowerL3",
				Name: "ActivePowerL3",
				Description: "Wirkleistung Phase 3 Speicher"
			},
			{
				Datapoint: "_sum/GridActivePowerL1",
				Name: "GridActivePowerL1",
				Description: "Wirkleistung Phase 1 Netz"
			},
			{
				Datapoint: "_sum/GridActivePowerL2",
				Name: "GridActivePowerL2",
				Description: "Wirkleistung Phase 2 Netz"
			},
			{
				Datapoint: "_sum/GridActivePowerL3",
				Name: "GridActivePowerL3",
				Description: "Wirkleistung Phase 3 Netz"
			},
			{
				Datapoint: "_sum/ProductionAcActivePowerL1",
				Name: "ProductionAcActivePowerL1",
				Description: "Wirkleistung Phase 1 Erzeuger"
			},
			{
				Datapoint: "_sum/ProductionAcActivePowerL2",
				Name: "ProductionAcActivePowerL2",
				Description: "Wirkleistung Phase 2 Erzeuger"
			},
			{
				Datapoint: "_sum/ProductionAcActivePowerL3",
				Name: "ProductionAcActivePowerL3",
				Description: "Wirkleistung Phase 3 Erzeuger"
			},
			{
				Datapoint: "_sum/ConsumptionActivePowerL1",
				Name: "ConsumptionActivePowerL1",
				Description: "Wirkleistung Phase 1 Verbraucher"
			},
			{
				Datapoint: "_sum/ConsumptionActivePowerL2",
				Name: "ConsumptionActivePowerL2",
				Description: "Wirkleistung Phase 2 Verbraucher"
			},
			{
				Datapoint: "_sum/ConsumptionActivePowerL3",
				Name: "ConsumptionActivePowerL3",
				Description: "Wirkleistung Phase 3 Verbraucher"
			},
		];


	static get getAllParamNames() {
		// return HeatingPump.AllParams.State;
		return Datapoints.AllParams.map(f => ({ name: f.name }));
	}
}
module.exports = Datapoints;
