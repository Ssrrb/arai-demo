# TUKU: No Te Caigas

Juego promocional en pixel art para la marca de balones TUKU. Cada edición entra al TUKU Lab para superar pruebas de agarre, rebote y resistencia, reunir 1.000 puntos de rendimiento y quedar certificada para la cancha.

## Experiencia

- Selección de cuatro ediciones equilibradas: Nebula, Fuego, Oro y Metal.
- El balón elegido es el protagonista y se conserva en `localStorage`.
- Fichas de rendimiento, núcleos de certificación, bloques de impacto y drones de calibración.
- Salto variable: mantener pulsado produce un salto más alto.
- Escenario industrial neutro con iluminación dinámica del color de la edición.
- Canvas adaptable para escritorio y móvil, con suavizado desactivado para conservar el pixel art.
- Ranking en tiempo real con WebSocket y persistencia opcional en PostgreSQL.
- CTA final accesible para visitar la tienda TUKU con el modelo activo.

Las cuatro ediciones son únicamente visuales: ninguna modifica dificultad, física, puntuación ni hitboxes.

## Controles

| Acción | Escritorio | Móvil |
|---|---|---|
| Saltar | `Espacio`, `↑` o `W` | Tocar y mantener |
| Salto alto | Mantener la tecla | Mantener pulsado |
| Música | `M` | — |

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
cp .env.example .env
# Configura DATABASE_URL para habilitar el ranking persistente.
npm install
npm start
```

El juego queda disponible en `http://localhost:8080`. La interfaz principal vive en un solo `index.html`; el servidor Node añade archivos estáticos, validación de nombres y ranking.

## Validación

```bash
npm test
npm run check
```

Los tests comprueban la configuración de marca, el CTA, la sintaxis del JavaScript inline y la estructura RGBA/dimensiones de los sprites TUKU.

## Compatibilidad de datos

Las claves históricas `mcc_best`, `mcc_best_b` y el campo WebSocket `bananas` se conservan deliberadamente para no invalidar récords ni exigir una migración de PostgreSQL. En pantalla se presentan como rendimiento y fichas.

## Assets TUKU

Los nuevos sprites están en [`assets/tuku/`](assets/tuku/). Fueron generados específicamente en pixel art de 16 bits, recortados, convertidos a transparencia y reducidos con nearest-neighbor. Los prompts y el procedimiento están documentados en [`assets/tuku/README.md`](assets/tuku/README.md).

Los assets anteriores permanecen como material fuente, pero ya no tienen referencias en tiempo de ejecución.

## Despliegue

```bash
docker compose up --build -d
```

El contenedor expone `/healthz`. Consulta [`TODO.md`](TODO.md) para las mejoras pendientes de seguridad y anti-trampas del ranking público.

## Licencia

MIT. Consulta [`LICENSE`](LICENSE).
