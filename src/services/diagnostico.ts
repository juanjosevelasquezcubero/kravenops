export type Sintoma = "nao_pega" | "falhando" | "fumaca_preta" | "perde_forca";

export const SINTOMAS: { id: Sintoma; label: string }[] = [
  { id: "nao_pega", label: "Não pega" },
  { id: "falhando", label: "Falhando" },
  { id: "fumaca_preta", label: "Fumaça preta" },
  { id: "perde_forca", label: "Perde força" },
];

export function diagnosticar(sintoma: Sintoma): string[] {
  switch (sintoma) {
    case "nao_pega":
      return ["bateria", "faísca nas velas", "bomba de combustível", "compressão"];
    case "falhando":
      return ["velas", "cabos de vela / bobina", "bicos injetores", "filtro de ar"];
    case "fumaca_preta":
      return ["filtro de ar", "bicos injetores", "sensor de oxigênio (sonda lambda)"];
    case "perde_forca":
      return ["filtro de combustível", "filtro de ar", "compressão", "catalisador entupido"];
  }
}
