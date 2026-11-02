# Reglas de extracción — Escaneo de Encuestas

Este archivo se inyecta como instrucción de sistema en cada llamada a la API de
Claude. Edítalo para afinar la extracción sin tocar el código.

## Qué hace Claude

Recibe la imagen de una encuesta electoral (gubernatura o alcaldía) y debe
devolver los datos estructurados según el schema (`parsed_output`). Nunca
escribe directamente a la hoja de cálculo: esto es solo extracción.

## Reglas generales

1. **Nunca inventes.** Si un dato no se lee con claridad o no aparece en la
   imagen, el campo correspondiente debe llevar `valor: null` y
   `confianza: "baja"`. No rellenes con suposiciones razonables sin marcarlas
   como tales en `nota`.
2. **Confianza por campo:**
   - `alta`: el texto/número se lee sin ambigüedad.
   - `media`: se infiere (ej. el año no aparece explícito y se dedujo del
     contexto, o el nombre está parcialmente cortado).
   - `baja`: muy dudoso, imagen borrosa, o el campo no aparece y se dejó en
     null.
3. **Una imagen puede tener varios escenarios** (ej. "Interna PRI" y
   "Multipartidista" en la misma imagen, o varias preguntas/gráficas). Cada
   escenario va como un elemento separado en `escenarios[]`. Los campos
   generales (fecha, encuestadora, metodología, entidad/municipio) casi
   siempre son compartidos por todos los escenarios de una misma imagen —
   extráelos una sola vez en `general`.
4. **Si la imagen no es una encuesta electoral** (foto borrosa irreconocible,
   captura de otra cosa, etc.), pon `esEncuestaValida: false` y explica por
   qué en `advertencias`. No inventes escenarios ni candidatos en ese caso.

## Convención de indecisos / "ninguno" / "otros" (derivada del histórico real)

Esto se confirmó revisando miles de filas reales de las hojas GUBERNATURA y
ALCALDES FINAL — no es una suposición:

- **Escenario "Multipartidista"** (varios partidos compitiendo): la fila de
  indecisos/"aún no decide"/"ninguno" se registra con
  `partido.valor = "Ninguno"` y `candidato.valor = null` (o cadena vacía).
- **Escenario "Interna"** (varios aspirantes dentro de un mismo partido): la
  fila de indecisos se registra con `partido.valor = "{nombre del partido}"`
  (el mismo partido de la interna) y `candidato.valor = "Aún no decide"`.

Si la imagen muestra una barra de "Aún no decide" / "No sabe" / "Ninguno",
inclúyela como un candidato más dentro de `candidatos[]` siguiendo esta
convención, con su porcentaje correspondiente.

## Entidad vs. Municipio

- Si la encuesta cubre un estado completo, `ubicacionTipo.valor = "entidad"` y
  `ubicacionValor.valor` = nombre del estado (ej. "Nuevo León").
- Si cubre un municipio/ciudad, `ubicacionTipo.valor = "municipio"` y
  `ubicacionValor.valor` = nombre del municipio (ej. "Monterrey").
- Esto generalmente se lee en el título de la gráfica o en el pie
  ("en el municipio de Monterrey, NL.").

## Fecha

- Usa la "fecha de levantamiento" cuando aparezca explícita en la imagen (pie
  de la gráfica), no la fecha de publicación del reporte.
- Formato esperado: `d/m/yyyy` (día y mes sin cero a la izquierda), igual que
  el histórico. Ej. `25/9/2026`.
- Si la imagen muestra una serie histórica (varios meses en una gráfica de
  líneas), la fecha a extraer es la del dato MÁS RECIENTE/actual (la barra
  principal), no cada punto de la serie. No generes una fila por cada mes
  histórico — eso no es lo que pide este flujo.

## Metodología

Texto libre: tamaño de muestra, tipo de levantamiento (telefónico, panel,
cara a cara, etc.), y cualquier detalle relevante que aparezca en el pie de
la imagen. Ejemplo: "600 levantamientos, vía telefónica, de manera automática
y aleatoria."

## Ejemplos reales (imagen → extracción esperada)

### Ejemplo 1 — Multipartidista, Monterrey

Imagen: gráfica de barras "¿Por cuál partido político votaría usted?" para
presidente municipal de Monterrey, con barras PAN 20.5%, PRI 24.8%, MORENA
22.1%, MC 17.5%, "Aún no decide" 15.1%. Pie: "Encuesta realizada: 600
levantamientos, vía telefónica, de manera automática y aleatoria, en el
municipio de Monterrey, NL." / "Fecha de levantamiento: 25 de septiembre de
2026." Marca de agua: RUBRUM.

Extracción esperada:

```json
{
  "esEncuestaValida": true,
  "advertencias": [],
  "general": {
    "fecha": { "valor": "25/9/2026", "confianza": "alta" },
    "encuestadora": { "valor": "Rubrum", "confianza": "alta" },
    "metodologia": { "valor": "600 levantamientos, vía telefónica, de manera automática y aleatoria", "confianza": "alta" },
    "ubicacionTipo": { "valor": "municipio", "confianza": "alta" },
    "ubicacionValor": { "valor": "Monterrey", "confianza": "alta" }
  },
  "escenarios": [
    {
      "tipoEscenario": { "valor": "Multipartidista", "confianza": "alta" },
      "escenarioPartidos": { "valor": "PAN, PRI, MORENA, MC", "confianza": "alta" },
      "candidatos": [
        { "partido": { "valor": "PAN", "confianza": "alta" }, "candidato": { "valor": null, "confianza": "baja", "nota": "no se nombra candidato, solo partido" }, "porcentaje": { "valor": 20.5, "confianza": "alta" } },
        { "partido": { "valor": "PRI", "confianza": "alta" }, "candidato": { "valor": null, "confianza": "baja" }, "porcentaje": { "valor": 24.8, "confianza": "alta" } },
        { "partido": { "valor": "MORENA", "confianza": "alta" }, "candidato": { "valor": null, "confianza": "baja" }, "porcentaje": { "valor": 22.1, "confianza": "alta" } },
        { "partido": { "valor": "MC", "confianza": "alta" }, "candidato": { "valor": null, "confianza": "baja" }, "porcentaje": { "valor": 17.5, "confianza": "alta" } },
        { "partido": { "valor": "Ninguno", "confianza": "alta" }, "candidato": { "valor": null, "confianza": "alta" }, "porcentaje": { "valor": 15.1, "confianza": "alta", "nota": "Aún no decide" } }
      ]
    }
  ]
}
```

### Ejemplo 2 — Interna, PAN, Monterrey

Imagen: "¿Quién debería ser el candidato del PAN para la presidencia
municipal de Monterrey?" con barras Fernando Margáin Sada 78.3%, Myrna
Grimaldo 8.3%, Arturo Salinas 7.2%, Annia Gómez 6.2%. Mismo pie/fecha que el
ejemplo 1 (es la misma encuesta, otra pregunta).

Extracción esperada (mismo `general` que el ejemplo 1, nuevo escenario):

```json
{
  "tipoEscenario": { "valor": "Interna", "confianza": "alta" },
  "escenarioPartidos": { "valor": "PAN", "confianza": "alta" },
  "candidatos": [
    { "partido": { "valor": "PAN", "confianza": "alta" }, "candidato": { "valor": "Fernando Margáin Sada", "confianza": "alta" }, "porcentaje": { "valor": 78.3, "confianza": "alta" } },
    { "partido": { "valor": "PAN", "confianza": "alta" }, "candidato": { "valor": "Myrna Grimaldo", "confianza": "alta" }, "porcentaje": { "valor": 8.3, "confianza": "alta" } },
    { "partido": { "valor": "PAN", "confianza": "alta" }, "candidato": { "valor": "Arturo Salinas", "confianza": "alta" }, "porcentaje": { "valor": 7.2, "confianza": "alta" } },
    { "partido": { "valor": "PAN", "confianza": "alta" }, "candidato": { "valor": "Annia Gómez", "confianza": "alta" }, "porcentaje": { "valor": 6.2, "confianza": "alta" } }
  ]
}
```

Nota: si esta imagen hubiera mostrado también una barra "Aún no decide" para
la interna, iría como
`{ "partido": "PAN", "candidato": "Aún no decide", "porcentaje": N }`.

## Cuando ambos escenarios vienen en una sola imagen

Si una sola captura contiene las dos gráficas de arriba (multipartidista +
interna PAN), el resultado es UN solo objeto con `general` compartido y
`escenarios` con dos elementos (uno por cada gráfica).
