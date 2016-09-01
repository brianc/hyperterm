const { app } = require('electron');
const { EventEmitter } = require('events');
const { exec } = require('child_process');
const defaultShell = require('default-shell');
const { getDecoratedEnv } = require('./plugins');
const { productName, version } = require('./package');
const config = require('./config');
const { Client } = require('ssh2');

const TITLE_POLL_INTERVAL = 500;

const envFromConfig = config.getConfig().env || {};

const HYPERPUTTY_HOST = process.env.HYPERPUTTY_HOST
const HYPERPUTTY_USER = process.env.HYPERPUTTY_USER
const HYPERPUTTY_PASSWORD = process.env.HYPERPUTTY_PASSWORD

module.exports = class Session extends EventEmitter {

  static spawn({ rows, cols: columns }, cb) {
    const conn = new Client();
    conn.on('ready', () => {
      conn.shell((err, stream) => {
        if (err) {
          console.log('shell creation error', err)
          return cb(err)
        }
        console.log('created shell')
        const session = new Session(stream)
        cb(null, session)
      })
    })

    conn.connect({
      host: HYPERPUTTY_HOST,
      port: 22,
      username: HYPERPUTTY_USER,
      password: HYPERPUTTY_PASSWORD,
    })

  }

  constructor (pty) {
    super();
    this.pty = pty;
    this.shell = 'ssh: ' + HYPERPUTTY_HOST
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
    return; // don't get tittle for ssh for now - not 100% sure how
    if ('win32' === process.platform) return;
    if (this.fetching) return;
    this.fetching = true;

    let tty = this.pty.stdout.ttyname;
    tty = tty.replace(/^\/dev\/tty/, '');

    // try to exclude grep from the results
    // by grepping for `[s]001` instead of `s001`
    tty = `[${tty[0]}]${tty.substr(1)}`;

    // TODO: limit the concurrency of how many processes we run?
    // TODO: only tested on mac
    exec(`ps uxac | grep ${tty} | head -n 1`, (err, out) => {
      this.fetching = false;
      if (this.ended) return;
      if (err) return;
      let title = out.split(' ').pop();
      if (title) {
        title = title.replace(/^\(/, '');
        title = title.replace(/\)?\n$/, '');
        if (title !== this.lastTitle) {
          this.emit('title', title);
          this.lastTitle = title;
        }
      }

      if (this.subscribed) {
        this.titlePoll = setTimeout(() => this.getTitle(), TITLE_POLL_INTERVAL);
      }
    });
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
