<h1 align='center'> 🎈 Decent </h1>

<div align='center'>
  <strong> The decentralized chat system that's absolutely okay </strong>
</div>

Decent is a [decentralized](#decentralized), [open source](#open-source), and even [tolerable](#tolerable) chat system [for hipsters](#110-hipster). It's free, as in freedom _and_ beer :beer: :tada:

<div align='center'>
  <h3>
    <a href='#why'> Why </a>
    <span> | </span>
    <a href='#how'> How </a>
    <span> | </span>
    <a href='https://decent-chat.github.io/decent/api.html'> API Docs </a>
  </h3>
</div>

---

## Why?

### Decentralized

Rather than living on a central server, Decent runs on servers by and for the people. You never have to give a single corporate identity the power to control the way you speak. Instead, connect to servers that are created by the users. Nobody has access to every server, so nobody has the power to tear down a system you rely on.

### Open source

Paranoid? So is Mark Zuckerberg - Mark knows _exactly_ how much information Facebook collects.

If you don't trust us (why would you?) you can view the source code for everything. Although our code isn't perfect, it's worth a read. Take a poke around at the server-side code or your client of choice, and make sure nobody's snooping.

There are other benefits to be had from an open-source program as well. If there's something that's bothering you about Decent, you have the power to fix it! Write up some new code and give us a shout; we'll consider your changes.

### Tolerable

Since Decent doesn't [harvest your data like other chat systems](https://discordapp.com/), we don't have a ton of cash to spend doing research or hiring professionals. But after hours of careful consideration, we've made all sorts of uninformed decisions that we think will improve your experience.

Decent works hard to give as much power as possible to the user. With **unlimited custom emotes**, **unlimited pinned messages**, and lots of markdown features in messages, Decent is sure to meet most of your expectations. The default client has a **moderately nice looking UI**, a sufficient supply of keyboard shortcuts, and plenty of **other nearly-noteworthy features**, making it the perfect fit for someone who wants to send decentralized messages without a substantial hassle.

### 110% hipster

With just _dozens_ of users around the globe, Decent is a hidden gem. You won't find every redditor and their mother around these parts, nor will you find all your coworkers. In fact, unless you specifically direct someone to Decent, they probably won't be here at all! Think of the freedom!

Plus, when you do convert someone to the marginally improved world of decentralized and demonetized messaging, they'll like you just a little bit better. You're cool now 🎈

---

## How?

If you're just a hipster that wants to join a Decent server... there aren't any, yet, as far as we know. Being part of the team behind [Nonfree News](https://nonfree.news), we're planning to start up a Decent-backed Nonfree News chat service in the near future, so look out for that.

Most Decent servers will serve a copy of the Decent web client located in this repository, so you can use that to access servers (any client can connect to any Decent server, regardless of origin). Alternatively, custom clients exist:

* [Weechat](https://github.com/TheInitializer/weecent/)

If you're someone who wants to **run your own Decent server**, read the following:

### Prerequisites

You will need:

* Node.js. Ideally a very, very recent version. You can use nvm to make installing it a lot easier.

* A web browser. Probably a very, very, very cutting-edge browser. We're testing Decent's reference client in Firefox Nightly, but you probably don't need the nightly version. Just run the latest release of your favorite browser.

### Installing/running

```
# Note --recursive! That's important.
$ git clone --recursive https://github.com/towerofnix/decent.git
$ cd decent
$ npm install
$ npm run build
$ node .
# open http://localhost:3000
```

You'll probably need to make a channel, but to do that, you'll need to make an admin user. Start by registering a user through your web browser (just click on the register button); once you've done that, type `make-admin (the username you picked)` into the `node` process:

```
$ node .
decent - listening on port 3000
> make-admin avjoe
Made avjoe an admin.
```

Then you can create a channel by logging in on the browser (you know, click the "login" button) and clicking on the "New" button next to the (empty) channel list.
