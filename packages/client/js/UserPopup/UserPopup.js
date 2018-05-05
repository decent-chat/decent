const { h, Component } = require('preact')
const Dropdown = require('/Dropdown')

class UserPopup extends Component {
  render(props) {
    const { user } = props

    return <Dropdown {...props}>
      <div class='UserPopup'>
        <img src={user.avatarURL} class='Avatar UserPopup-avatar'/>
        <div class='UserPopup-username'>{user.username}</div>

        <div class='UserPopup-roles'>
          {user.roles.map(role =>
            <div class='UserPopup-role'>
              {role.name}
            </div>
          )}
        </div>
      </div>
    </Dropdown>
  }
}

module.exports = UserPopup
