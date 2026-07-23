# Cartodex — Data Sources

> Generated from the dataset catalog (`src/app/catalog.ts`) by `pnpm gen-docs`. Do not edit
> by hand; edit the catalog and regenerate. Every baked snapshot is an open-licensed source,
> normalised and re-hosted; the in-app attribution string carries the same credit.

63 datasets across 9 domains.

### Demographics

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Population | `region` | World Bank WDI | CC-BY 4.0 |
| Population density (per km²) | `region` | World Bank WDI | CC-BY 4.0 |
| Population growth (%/yr) | `region` | World Bank WDI | CC-BY 4.0 |
| Life expectancy (years) | `region` | World Bank WDI | CC-BY 4.0 |
| Fertility rate (births/woman) | `region` | World Bank WDI | CC-BY 4.0 |
| Urban population (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Infant mortality (per 1k births) | `region` | World Bank WDI | CC-BY 4.0 |
| Net migration | `region` | World Bank WDI | CC-BY 4.0 |
| World cities | `point` | Natural Earth | Public domain |

### Economy

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| GDP (current US$) | `region` | World Bank WDI | CC-BY 4.0 |
| GDP per capita (US$) | `region` | World Bank WDI | CC-BY 4.0 |
| GDP per capita, PPP (int$) | `region` | World Bank WDI | CC-BY 4.0 |
| GDP growth (%/yr) | `region` | World Bank WDI | CC-BY 4.0 |
| GNI per capita (US$) | `region` | World Bank WDI | CC-BY 4.0 |
| Inflation (%/yr) | `region` | World Bank WDI | CC-BY 4.0 |
| Unemployment (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Gini index | `region` | World Bank WDI | CC-BY 4.0 |
| Exports (% of GDP) | `region` | World Bank WDI | CC-BY 4.0 |
| Tourism arrivals | `region` | World Bank WDI | CC-BY 4.0 |
| Tax revenue (% of GDP) | `region` | World Bank WDI | CC-BY 4.0 |

### Society

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Internet users (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Mobile subscriptions (per 100) | `region` | World Bank WDI | CC-BY 4.0 |
| Adult literacy (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Secondary enrolment (% gross) | `region` | World Bank WDI | CC-BY 4.0 |
| R&D spending (% of GDP) | `region` | World Bank WDI | CC-BY 4.0 |

### Resources & environment

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| CO₂ per capita (t) | `region` | World Bank WDI | CC-BY 4.0 |
| Forest area (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Arable land (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Agricultural land (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Renewable energy (% of final) | `region` | World Bank WDI | CC-BY 4.0 |
| Electricity access (%) | `region` | World Bank WDI | CC-BY 4.0 |
| Energy use per capita (kg oil eq) | `region` | World Bank WDI | CC-BY 4.0 |
| Renewable freshwater per capita (m³) | `region` | World Bank WDI | CC-BY 4.0 |
| Land area (km²) | `region` | World Bank WDI | CC-BY 4.0 |
| Terrestrial protected areas (%) | `region` | World Bank WDI | CC-BY 4.0 |

### Health

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Health spending (% of GDP) | `region` | World Bank WDI | CC-BY 4.0 |
| Physicians (per 1k) | `region` | World Bank WDI | CC-BY 4.0 |
| Hospital beds (per 1k) | `region` | World Bank WDI | CC-BY 4.0 |
| Under-5 mortality (per 1k) | `region` | World Bank WDI | CC-BY 4.0 |
| DPT immunization (% of children) | `region` | World Bank WDI | CC-BY 4.0 |

### Transport

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Airports | `point` | OpenFlights | Open Database License |
| Flight routes | `pair` | OpenFlights | Open Database License |

### Maritime

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Seaports (all vessels) | `point` | NGA World Port Index + IMF PortWatch | Public domain (WPI) · IMF PortWatch (attribution) |
| Container | `point` | NGA World Port Index + IMF PortWatch | Public domain (WPI) · IMF PortWatch (attribution) |
| Tanker | `point` | NGA World Port Index + IMF PortWatch | Public domain (WPI) · IMF PortWatch (attribution) |
| Dry bulk | `point` | NGA World Port Index + IMF PortWatch | Public domain (WPI) · IMF PortWatch (attribution) |
| Shipping lanes (network) | `lines` | newzealandpaul/Shipping-Lanes | CC BY-SA 4.0 |
| All traffic | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Cargo | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Commercial | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Oil & gas | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Non-cargo | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Passenger | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Leisure | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Fishing | `lines` | Shipping-Lanes + Global Ship Density | CC BY-SA 4.0 (lanes) · CC BY 4.0 (density) |
| Submarine cables | `lines` | OpenStreetMap | ODbL |

### Environment

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Surface winds | `grid` | FNMOC via NOAA CoastWatch ERDDAP | Public domain (US Gov) |
| Ocean currents | `grid` | Aviso via NOAA CoastWatch ERDDAP | Aviso+ altimetry (attribution) |
| Rivers & lakes | `lines` | Natural Earth | Public domain |

### Hazards

| Dataset | Kind | Provider | Licence |
|---|---|---|---|
| Earthquakes (recent, significant) | `point` | USGS | Public domain (US Gov) |
| Earthquakes (great, since 1900) | `point` | USGS | Public domain (US Gov) |
| Volcanoes | `point` | NOAA NCEI | Public domain (US Gov) |
| Tectonic plate boundaries | `lines` | fraxen/tectonicplates (Bird 2003) | ODC-BY 1.0 |

