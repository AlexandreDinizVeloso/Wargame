extends Node
## Wiring only. Rule validation and turn resolution remain in the Node.js server.
@onready var network = $NetworkClient
@onready var table = $WarTable
@onready var hud = $HUD
@onready var cinematics = $Cinematics
var _previous_state: Dictionary = {}
var _selected_army := ""

func _ready() -> void:
	get_viewport().transparent_bg = false
	network.bootstrap_received.connect(_bootstrap)
	network.state_received.connect(_state)
	network.rooms_received.connect(hud.show_rooms)
	network.connection_changed.connect(hud.set_connection)
	network.request_failed.connect(hud.show_error)
	network.busy_changed.connect(hud.set_busy)
	hud.connect_requested.connect(network.connect_server)
	hud.create_requested.connect(network.create_room)
	hud.join_requested.connect(network.join_room)
	hud.resume_requested.connect(network.resume_session)
	hud.rooms_requested.connect(network.refresh_rooms)
	hud.command_requested.connect(network.send_command)
	hud.ready_requested.connect(network.set_ready)
	hud.war_requested.connect(network.declare_war)
	hud.province_focused.connect(table.focus_province)
	hud.battalion_focused.connect(_select_army)
	hud.disconnect_requested.connect(network.leave_local_session)
	hud.quality_requested.connect(func(preset: String): table.set_quality(preset))
	if table.has_signal("quality_changed"):
		table.quality_changed.connect(hud.set_quality)
		hud.set_quality(table.quality_preset)
	table.territory_selected.connect(_select_province)
	table.battalion_selected.connect(_select_army)
	table.territory_command.connect(_move_to)
	hud.set_server_url(network.base_url)
	hud.set_recovery_available(network.has_session())
	network.connect_server(network.base_url)

func _bootstrap(data: Dictionary) -> void:
	table.set_schema(data)
	hud.set_schema(data)

func _state(game: Dictionary, metadata: Dictionary) -> void:
	var player_id := str(network.session.get("playerId", ""))
	if game.is_empty():
		_previous_state = {}
		_selected_army = ""
		hud.apply_state({}, player_id, {})
		return
	if str(game.get("code", "")) != str(_previous_state.get("code", "")):
		_previous_state = {}
		_selected_army = ""
	table.apply_state(game, player_id)
	hud.apply_state(game, player_id, metadata)
	cinematics.observe_state(game, _previous_state, player_id)
	_previous_state = game.duplicate(true)

func _select_province(province_id: String) -> void:
	hud.inspect_province(province_id)

func _select_army(battalion_id: String) -> void:
	_selected_army = battalion_id
	table.select_battalion(battalion_id)
	hud.inspect_battalion(battalion_id)

func _move_to(province_id: String) -> void:
	if _selected_army.is_empty():
		hud.show_error("Selecione um batalhão próprio e use o botão direito no destino.")
		return
	hud.request_move(_selected_army, province_id)
