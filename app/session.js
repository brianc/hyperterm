const { EventEmitter } = require('events');
const { Client } = require('ssh2');

const HYPERPUTTY_HOST = process.env.HYPERPUTTY_HOST;
const HYPERPUTTY_USER = process.env.HYPERPUTTY_USER;
const HYPERPUTTY_PASSWORD = process.env.HYPERPUTTY_PASSWORD;

module.exports = class Session extends EventEmitter {
  static spawn ({ rows, cols: columns }, cb) {
    const conn = new Client();
    conn.on('ready', () => {
      conn.shell((err, stream) => {
        if (err) {
          console.log('shell creation error', err);
          return cb(err);
        }
        console.log(`connected: ${HYPERPUTTY_USER}@${HYPERPUTTY_HOST}`);
        const session = new Session(stream);
        cb(null, session);
      });
    });

    conn.connect({
      host: HYPERPUTTY_HOST,
      port: 22,
      username: HYPERPUTTY_USER,
      password: HYPERPUTTY_PASSWORD
    });
  }

  constructor (pty) {
    super();
    this.pty = pty;
    this.shell = 'ssh: ' + HYPERPUTTY_HOST;
    this.pty.stdout.on('data', (data) => {
      if (this.ended) {
        return;
      }
      this.emit('data', data.toString('utf8'));
    });

    this.pty.on('exit', () => {
      if (!this.ended) {
        this.ended = true;
        this.emit('exit');
      }
    });
  }

  focus () {
    this.subscribed = true;
    this.getTitle();
  }

  blur () {
    this.subscribed = false;
    clearTimeout(this.titlePoll);
  }

  getTitle () {
    return `${HYPERPUTTY_USER}@${HYPERPUTTY_HOST}`;
  }

  exit () {
    this.destroy();
  }

  write (data) {
    this.pty.stdin.write(data);
  }

  resize ({ cols: columns, rows }) {
    try {
      this.pty.setWindow(rows, columns);
    } catch (err) {
      console.error(err.stack);
    }
  }

  destroy () {
    try {
      this.pty.end();
    } catch (err) {
      console.error('exit error', err.stack);
    }
    this.emit('exit');
    this.ended = true;
    this.blur();
  }

};
