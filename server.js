
process.env.ENV   = process.env.ENV   || 'prod'; // TODO: Remove this once process.env.STAGE is fully integrated.
process.env.STAGE = process.env.STAGE || 'prod'; // TODO: Change this to 'alpha' once process.env.STAGE is fully integrated.

const app  = require('./src/index.js');
const port = process.env.PORT || 8080;
app.listen(port, console.log(`Server is up and listening at ${ port } port.`));
