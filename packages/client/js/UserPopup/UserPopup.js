const { h, Component } = require('preact')
const Dropdown = require('/Dropdown')
const Modal = require('/Modal')
const { save, load } = require('../storage')

class UserPopup extends Component {
  state = {canAddRemoveRoles: load('canAddRemoveRoles'), showGrantRoleModal: false}

  async componentWillMount() {
    const { user } = this.props

    user.on('delete', () => {
      this.props.onClose()
    })

    user.on('change', () => this.forceUpdate())

    const { me } = this.context.pool.activeServer.client
    const canAddRemoveRoles = me && (await me.getPermissions()).manageRoles

    save('canAddRemoveRoles', canAddRemoveRoles)

    this.setState({
      canAddRemoveRoles,
    })
  }

  render(props, { canAddRemoveRoles, showGrantRoleModal }) {
    const { user } = props

    return <Dropdown {...props}>
      <div class='UserPopup'>
        <img src={user.avatarURL} class='Avatar UserPopup-avatar'/>
        <div class='UserPopup-username'>{user.username}</div>

        <div class='UserPopup-roles'>
          {user.roles.map(role =>
            <div class='UserPopup-role'>
              {role.name}

              {canAddRemoveRoles && <div class='UserPopup-role-removeButton'>-</div>}
            </div>
          )}
        </div>

        {canAddRemoveRoles && <div class='Dropdown-separator'/>}
        {canAddRemoveRoles && <div class='Dropdown-listItem' onClick={() => {
          this.setState({showGrantRoleModal: true})
        }}>Grant role...</div>}

        {showGrantRoleModal && <Modal.Async
          mini
          submit={async ({ role }) => {
            // TODO
            alert('Not implemented')
          }}
          onHide={() => {
            this.setState({showGrantRoleModal: false})
            //this.props.onClose()
          }}
        >
          {/* TODO */}
        </Modal.Async>}
      </div>
    </Dropdown>
  }
}

module.exports = UserPopup
