# TweetAniquilator3000
Script para eliminar tweets y retweets desde la web de X, sin usar la API de pago.

## Cómo funciona
Se ejecuta en la consola del navegador, en tu propio perfil. Hace lo mismo que harías a mano (menú "..." > Eliminar > Confirmar), pero de forma automática, y:

- Lee las respuestas reales del servidor de X (200 = borrado, 429 = límite alcanzado) en lugar de fiarse de la pantalla.
- Trabaja por tandas (190 borrados por tanda por defecto) y descansa entre ellas para respetar el límite de X.
- Si X devuelve un 429, espera y continúa solo.
- Deshace también los retweets.

## Uso
1. Entra en x.com con tu sesión iniciada y ve a tu perfil (pestaña **Posts**).
2. Recarga la página (F5).
3. Abre la consola del navegador (F12 > Consola).
4. Copia el contenido de `tweetaniquilator3000.js`, pégalo y pulsa Enter.
5. Déjalo trabajando con la pestaña abierta y visible, y sin que el equipo se suspenda.
6. Para detenerlo, escribe `window.detener = true` en la consola.

Al terminar, si avisa de tweets rechazados por X, recarga la página y vuelve a ejecutarlo.

## Ajustes
Al principio del archivo puedes cambiar:

| Ajuste | Qué hace |
|---|---|
| `MAX_POR_TANDA` | Borrados por tanda antes de descansar |
| `DESCANSO_MS` | Descanso mínimo entre tandas |
| `PAUSA_MIN` / `PAUSA_MAX` | Pausa entre cada borrado |

## Aviso
- Úsalo solo en tu propia cuenta.
- Automatizar la web de X puede ir en contra de sus condiciones de uso. Usa un ritmo suave y bajo tu responsabilidad.
- El borrado es **irreversible**. Haz antes una copia de tu archivo de datos (Ajustes > Tu cuenta > Descargar un archivo de tus datos).
- Si X cambia su diseño, el script puede dejar de funcionar.
- Proyecto sin afiliación con X Corp.

## Licencia
MIT
