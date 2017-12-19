See #122.

- [X] Support selecting a server. The server dropdown should be filled.
- [ ] Support viewing channels. The sidebar channel list should automatically be filled when you select a server, and should automatically update according to the [appropriate](https://github.com/towerofnix/decent/wiki/API#from-server-created-new-channel) [websocket](https://github.com/towerofnix/decent/wiki/API#from-server-renamed-channel) [events](https://github.com/towerofnix/decent/wiki/API#from-server-deleted-channel).
- [ ] Support registering. **There should be some sort of a modal - do *not* use `prompt`.** Handle error messages appropriately (unfortunately there's no documentation for them, but you can read [the code](https://github.com/towerofnix/decent/blob/34288140b32eb10f70f95876fadb4877b3807552/api.js#L895-L934); it's pretty self descriptive and easy to follow). You should confirm that the entered username [is available](https://github.com/towerofnix/decent/wiki/API#get-apiusername-availableusername) before actually sending [the register request](https://github.com/towerofnix/decent/wiki/API#post-apiregister).
- [ ] Support logging in and out. Logging in means making [the appropriate request](https://github.com/towerofnix/decent/wiki/API#post-apilogin) and keeping track of the returned session ID; logging out means discarding that session ID. These should update the "user info" display (username, log in/out/register buttons), obviously.
  - [ ] Support handling the [`ping for data`](https://github.com/towerofnix/decent/wiki/API#to-client-ping-for-data) WebSocket event. You can confirm this is working by checking [the user list endpoint](https://github.com/towerofnix/decent/wiki/API#get-apiuser-list): when you're logged in, the user of the session ID you're logged in with should show as "online" there.
- [ ] Support sending messages. Pressing enter in the text field should [submit a message](https://github.com/towerofnix/decent/wiki/API#post-apisend-message) (and so should clicking the "send" button).
- Support reading messages.
  - [ ] Read messages as they're sent by handling [the relevant WebSocket event](https://github.com/towerofnix/decent/wiki/API#from-server-received-new-message).
  - [ ] Fetch the most recent messages. [There's an API for that.](https://github.com/towerofnix/decent/wiki/API#get-apichannelchannelidlatest-messages)
  - [ ] Fetch old messages when you scroll to the top. This is *not* something you can skip. See #31 for info. There are some API changes I need to make before you can do this, though.
  - Messages are displayed in groups. These follow PullJosh's design. (You can use placeholder profile pictures for now.) Group timestamps should be formatted according to https://github.com/towerofnix/decent/issues/116#issuecomment-352268366. To determine if a message should appear in the same message group as another, the following conditions should be true:
    - The two messages should have the same author (ID).
    - The two messages should be consecutive. Message A shouldn't appear in the same group as Message C if Message B is already in a different group (e.g. because it has a different author).
    - The message group should never contain more than 20 messages.
    - If the later message was posted at least an hour after the earlier one, it shouldn't be in the smae group.
- [X] Store and load session data (and the added server list) from `localStorage`. See #113. When you sign in, you should stay signed in until you click the "log out" button, even if you reload the page.
