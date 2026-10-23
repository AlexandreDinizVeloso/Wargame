extends CanvasLayer
## Native controls only. Costs and spendable balances come from server quotes.
signal connect_requested(url: String)
signal create_requested(player_name: String, nation_id: String, public_room: bool)
signal join_requested(code: String, player_name: String, nation_id: String)
signal resume_requested()
signal rooms_requested()
signal command_requested(command: Dictionary)
signal ready_requested(ready: bool)
signal war_requested(target_id: String, casus_belli: String, allies: Array)
signal province_focused(province_id: String)
signal battalion_focused(battalion_id: String)
signal disconnect_requested()
signal quality_requested(preset: String)

const Floating = preload("res://scripts/FloatingPanel.gd")
const GOLD := Color("ddbd75")
const INK := Color("101e2a")
const PAPER := Color("e9e1ce")
const BUILDING_NAMES := {"MARKET":"Mercado", "BARRACKS":"Quartel", "FORT":"Fortaleza", "PORT":"Porto", "FOUNDRY":"Fundição", "TEMPLE":"Templo"}
const BUILDING_FIELDS := {"MARKET":"marketLevel", "BARRACKS":"barracksLevel", "FORT":"fortLevel", "PORT":"portLevel", "FOUNDRY":"foundryLevel", "TEMPLE":"templeLevel"}
const UNIT_NAMES := {"infantry":"Infantaria", "cavalry":"Cavalaria", "artillery":"Artilharia", "warships":"Navio de guerra", "transports":"Transporte"}
const TERRAIN_NAMES := {"plains":"Planícies", "hills":"Colinas", "mountains":"Montanhas", "forest":"Floresta", "coastal":"Litoral"}
const ORDER_NAMES := {"RECRUIT_BATTALION":"Recrutar tropas", "MOVE_BATTALION":"Marchar / navegar", "ENTRENCH_BATTALION":"Entrincheirar", "TRAIN_BATTALION":"Treinar", "ASSAULT_SIEGE":"Assaltar muralhas", "EMBARK_BATTALION":"Embarcar / desembarcar", "AUTO_TRANSPORT":"Travessia automática", "NAVAL_BRIDGE":"Ponte naval", "BUILD_FORT":"Construir fortaleza", "BUILD_MARKET":"Construir mercado", "BUILD_PORT":"Construir porto", "PACIFY":"Pacificar", "CONVERT":"Converter", "BOMBARD_COAST":"Bombardear costa", "RAZE_PROVINCE":"Arrasar região"}
const SEASON_IDS := ["SPRING", "SUMMER", "AUTUMN", "WINTER"]
const SEASON_NAMES := ["Primavera", "Verão", "Outono", "Inverno"]
const SEASON_RULES := ["Recrutas ×2; travessia de rios −25% ataque.", "+1 alcance terrestre, +15% ataque e +1 progresso de cerco.", "Comércio terrestre e marítimo ×2; Mercado/Porto −25%.", "Fora de terra própria pacificada: mínimo20% baixas e −15 moral; campanha +50% manutenção."]
var state: Dictionary = {}
var schema: Dictionary = {}
var metadata: Dictionary = {}
var player_id := ""
var selected_province := ""
var selected_battalion := ""
var _right_tab := "chronicle"
var _inspection_fingerprint := ""
var _right_fingerprint := ""
var _status := "offline"
var _busy := false
var _root: Control
var _topbar: PanelContainer
var _brand: Label
var _lobby: PanelContainer
var _server: LineEdit
var _name: LineEdit
var _code: LineEdit
var _nation: OptionButton
var _public: CheckBox
var _room_list: ItemList
var _lobby_players: Label
var _resume: Button
var _add_bot: Button
var _start: Button
var _resources: Label
var _season: Label
var _ready_button: Button
var _connection: Label
var _quality: OptionButton
var _message: Label
var _left
var _right
var _room_codes: Array[String] = []
var _error_timer: Timer
var _war_dialog: ConfirmationDialog
var _war_pending: Dictionary = {}

func _ready() -> void:
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_root.theme = _theme()
	_build_top_bar()
	_build_lobby()
	_left = Floating.new()
	_root.add_child(_left)
	_left.initialize("Inspeção", Vector2(24, 390), Vector2(440, 600))
	_left.hide()
	_right = Floating.new()
	_root.add_child(_right)
	_right.initialize("Crônica e ordens", Vector2(1390, 390), Vector2(500, 600))
	_right.hide()
	_message = Label.new()
	_message.position = Vector2(490, 1010)
	_message.size = Vector2(930, 54)
	_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_message.add_theme_color_override("font_color", Color("ffcf9d"))
	_root.add_child(_message)
	_error_timer = Timer.new()
	_error_timer.one_shot = true
	_error_timer.wait_time = 9
	_error_timer.timeout.connect(func(): _message.text = "")
	add_child(_error_timer)
	_war_dialog = ConfirmationDialog.new()
	_war_dialog.title = "Declaração de guerra"
	_war_dialog.ok_button_text = "Declarar guerra e marchar"
	_war_dialog.cancel_button_text = "Voltar"
	_war_dialog.confirmed.connect(func(): command_requested.emit(_war_pending))
	_root.add_child(_war_dialog)

func _theme() -> Theme:
	var result := Theme.new()
	result.default_font_size = 18
	if ResourceLoader.exists("res://data/fonts/Interface.ttf"):
		result.default_font = load("res://data/fonts/Interface.ttf")
	result.set_color("font_color", "Label", PAPER)
	result.set_color("font_color", "Button", PAPER)
	for variation in ["panel", "normal", "hover", "pressed", "disabled", "focus"]:
		var style := StyleBoxFlat.new()
		style.bg_color = INK.lightened(0.05 if variation == "hover" else 0.0)
		style.bg_color.a = 0.97
		style.border_color = GOLD.darkened(0.35)
		style.set_border_width_all(1)
		style.set_corner_radius_all(5)
		style.content_margin_left = 14
		style.content_margin_right = 14
		style.content_margin_top = 10
		style.content_margin_bottom = 10
		if variation == "disabled": style.bg_color = Color("26313b")
		for control_type in ["PanelContainer", "Button", "LineEdit", "OptionButton", "ItemList", "SpinBox"]:
			result.set_stylebox(variation, control_type, style)
	return result

func _build_top_bar() -> void:
	_topbar = PanelContainer.new()
	_topbar.position = Vector2(16, 12)
	_topbar.size = Vector2(1888, 124)
	_root.add_child(_topbar)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	_topbar.add_child(column)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 24)
	top.custom_minimum_size.y = 46
	column.add_child(top)
	_brand = _label("CONCÓRDIA 3D", 25)
	_brand.autowrap_mode = TextServer.AUTOWRAP_OFF
	_brand.custom_minimum_size.x = 300
	_brand.add_theme_color_override("font_color", GOLD)
	if ResourceLoader.exists("res://data/fonts/Cinzel.ttf"):
		_brand.add_theme_font_override("font", load("res://data/fonts/Cinzel.ttf"))
	top.add_child(_brand)
	_resources = _label("Entre em uma sala para governar", 23)
	_resources.autowrap_mode = TextServer.AUTOWRAP_OFF
	_resources.clip_text = true
	_resources.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_resources.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_resources)
	_ready_button = _toolbar_button("Confirmar ordens", _toggle_ready)
	_ready_button.custom_minimum_size = Vector2(230, 46)
	_ready_button.hide()
	top.add_child(_ready_button)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.custom_minimum_size.y = 42
	column.add_child(row)
	row.add_child(_toolbar_button("Sala", func(): _lobby.show()))
	row.add_child(_toolbar_button("Crônica / Ordens", _open_right.bind("chronicle")))
	var councils := MenuButton.new()
	councils.text = "Conselhos"
	councils.custom_minimum_size = Vector2(130, 42)
	var popup := councils.get_popup()
	popup.add_item("Exércitos e armadas", 0)
	popup.add_item("Minha nação / Conselho / Doutrinas", 1)
	popup.add_item("Diplomacia", 2)
	popup.add_separator()
	popup.add_item("Desconectar desta sala", 3)
	popup.id_pressed.connect(func(id: int):
		if id == 3: _disconnect()
		else: _open_right(["armies", "nation", "diplomacy"][id])
	)
	row.add_child(councils)
	_season = _label("Mesa de guerra · selecione e explore", 17)
	_season.autowrap_mode = TextServer.AUTOWRAP_OFF
	_season.clip_text = true
	_season.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_season.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_season.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_season)
	_quality = OptionButton.new()
	_quality.custom_minimum_size.x = 180
	for quality in [["high", "Alta · MSAA4×"], ["balanced", "Equilibrada"], ["low", "Leve"]]:
		_quality.add_item(str(quality[1]))
		_quality.set_item_metadata(_quality.item_count - 1, quality[0])
	_quality.tooltip_text = "Qualidade gráfica local. F6 também alterna os perfis."
	_quality.item_selected.connect(func(index: int): quality_requested.emit(str(_quality.get_item_metadata(index))))
	row.add_child(_quality)
	_connection = _label("Desconectado", 16)
	_connection.autowrap_mode = TextServer.AUTOWRAP_OFF
	_connection.custom_minimum_size.x = 125
	_connection.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(_connection)

func _build_lobby() -> void:
	_lobby = PanelContainer.new()
	_lobby.position = Vector2(620, 170)
	_lobby.size = Vector2(680, 760)
	_root.add_child(_lobby)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_lobby.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 13)
	scroll.add_child(column)
	column.add_child(_label("Mesa de Guerra · Multijogador", 30))
	column.add_child(_label("Crie uma sala ou entre com o mesmo código usado no navegador."))
	var row := HBoxContainer.new()
	column.add_child(row)
	_server = LineEdit.new()
	_server.placeholder_text = "http://localhost:3000"
	_server.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_server)
	row.add_child(_button("Conectar", _connect_server))
	_name = LineEdit.new()
	_name.text = "Estrategista"
	_name.placeholder_text = "Seu nome"
	_name.max_length = 24
	column.add_child(_name)
	_nation = OptionButton.new()
	column.add_child(_nation)
	_public = CheckBox.new()
	_public.text = "Publicar sala no lobby"
	column.add_child(_public)
	var create := _button("Criar nova campanha", _create_room)
	column.add_child(create)
	var join_row := HBoxContainer.new()
	column.add_child(join_row)
	_code = LineEdit.new()
	_code.placeholder_text = "Código da sala"
	_code.max_length = 6
	_code.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	join_row.add_child(_code)
	join_row.add_child(_button("Entrar", _join_room))
	_resume = _button("Retomar minha última sessão", func(): resume_requested.emit())
	column.add_child(_resume)
	var room_header := HBoxContainer.new()
	column.add_child(room_header)
	var room_title := _label("Salas públicas")
	room_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	room_header.add_child(room_title)
	room_header.add_child(_button("Atualizar", func(): rooms_requested.emit()))
	_room_list = ItemList.new()
	_room_list.custom_minimum_size.y = 135
	_room_list.item_selected.connect(func(index: int):
		if index < _room_codes.size(): _code.text = _room_codes[index]
	)
	column.add_child(_room_list)
	_lobby_players = _label("")
	column.add_child(_lobby_players)
	var host_row := HBoxContainer.new()
	column.add_child(host_row)
	_add_bot = _button("Adicionar bot", _send.bind({"type":"ADD_BOT"}))
	host_row.add_child(_add_bot)
	_start = _button("Iniciar partida", _send.bind({"type":"START_GAME"}))
	host_row.add_child(_start)
	host_row.add_child(_button("Voltar à mesa", func(): _lobby.hide()))
	_add_bot.hide()
	_start.hide()
	column.add_child(_label("WASD / botão do meio: mover câmera · roda: zoom\nClique esquerdo: selecionar · direito: marchar ou atacar", 15))

func set_server_url(url: String) -> void:
	_server.text = url

func set_recovery_available(available: bool) -> void:
	_resume.disabled = not available

func set_quality(preset: String) -> void:
	for index in range(_quality.item_count):
		if str(_quality.get_item_metadata(index)) == preset:
			_quality.select(index)
			return

func set_schema(data: Dictionary) -> void:
	schema = data.get("schema", data)
	_nation.clear()
	for nation in schema.get("nations", []):
		_nation.add_item(str(nation.get("name", nation.get("id", ""))))
		_nation.set_item_metadata(_nation.item_count - 1, nation.get("id", ""))

func set_connection(value: String) -> void:
	_status = value
	var names := {"online":"Conectado", "offline":"Sem conexão", "connecting":"Conectando…", "recovery":"Retome sua sessão"}
	_connection.text = names.get(value, value)

func set_busy(value: bool) -> void:
	_busy = value
	_connection.modulate.a = 0.65 if value else 1.0

func show_error(message: String) -> void:
	_message.text = message
	_error_timer.start()

func show_rooms(rooms: Array) -> void:
	_room_list.clear()
	_room_codes.clear()
	for room in rooms:
		var code := str(room.get("roomId", room.get("code", "")))
		_room_codes.append(code)
		_room_list.add_item("%s · %s · %s/8 · rodada %s" % [code, room.get("roomName", "Campanha"), room.get("playersCount", 0), room.get("turn", 0)])
	if rooms.is_empty(): _room_list.add_item("Nenhuma sala pública. Crie uma ou entre pelo código.")

func apply_state(game: Dictionary, viewer: String, details: Dictionary) -> void:
	var old_code := str(state.get("code", ""))
	var old_phase := str(state.get("phase", ""))
	state = game
	metadata = details
	player_id = viewer
	if state.is_empty():
		_lobby.show()
		_left.hide()
		_right.hide()
		_ready_button.hide()
		_resources.text = "Entre em uma sala para governar"
		return
	var me := _me()
	var reserved: Dictionary = metadata.get("reserved", {})
	_resources.text = "Ouro disponível %s  ·  Recrutas %s  ·  Autoridade %s" % [_number(maxf(0, float(me.get("gold", 0)) - float(reserved.get("gold", 0)))), _number(maxf(0, float(me.get("manpower", 0)) - float(reserved.get("manpower", 0)))), _number(_authority(me) - float(reserved.get("influence", 0)))]
	_resources.tooltip_text = "Tesouro %s · reservado %s\nSaldo previsto %s / rodada" % [_number(me.get("gold", 0)), _number(reserved.get("gold", 0)), _number(metadata.get("economy", {}).get("net", 0))]
	var turn := int(state.get("turn", 1))
	var season_index := int(floor(float(maxi(1, turn) - 1) / 3.0)) % 4
	var phase := str(state.get("phase", "lobby"))
	var step := (turn - 1) % 3 + 1
	_season.text = "%s %s/3 · próxima %s em %s rodada(s) · %s" % [SEASON_NAMES[season_index].to_upper(), step, SEASON_NAMES[(season_index + 1) % 4], 3 - step, state.get("code", "")]
	_season.tooltip_text = SEASON_RULES[season_index]
	_ready_button.visible = phase == "planning"
	_ready_button.text = "Reabrir ordens" if me.get("ready", false) else "Confirmar ordens"
	_ready_button.disabled = _status != "online"
	var lobby_lines: Array[String] = []
	for player in state.get("players", []):
		lobby_lines.append(("Bot · " if player.get("bot", false) else "Jogador · ") + str(player.get("name", "")) + " — " + str(player.get("nation", "")))
	_lobby_players.text = "Sala %s\n%s" % [state.get("code", ""), "\n".join(lobby_lines)]
	var is_host := str(state.get("hostId", "")) == player_id
	_add_bot.visible = phase == "lobby" and is_host
	_add_bot.disabled = state.get("players", []).size() >= 8
	_start.visible = phase == "lobby" and is_host
	_start.disabled = state.get("players", []).size() < 3
	_resume.disabled = false
	if phase == "lobby":
		_lobby.show()
	elif old_code != str(state.get("code", "")) or old_phase == "lobby":
		_lobby.hide()
		_right.show()
	_refresh_inspector()
	_refresh_right()
	if phase == "finished":
		_open_right("nation")

func inspect_province(province_id: String) -> void:
	selected_province = province_id
	selected_battalion = ""
	_inspection_fingerprint = ""
	_left.show()
	_left.move_to_front()
	_refresh_inspector()

func inspect_battalion(battalion_id: String) -> void:
	selected_battalion = battalion_id
	var army := _find(state.get("battalions", []), battalion_id)
	selected_province = str(army.get("provinceId", ""))
	_inspection_fingerprint = ""
	_left.show()
	_left.move_to_front()
	_refresh_inspector()

func request_move(army_id: String, province_id: String) -> void:
	var army := _find(state.get("battalions", []), army_id)
	var target := _find(state.get("provinces", []), province_id)
	if army.is_empty() or str(army.get("ownerId", "")) != player_id:
		show_error("Selecione um batalhão próprio para marchar.")
		return
	if not _can_order(): return
	if not str(army.get("embarkedOnId", "")).is_empty():
		_send({"type":"SUBMIT_ORDER", "order":{"type":"EMBARK_BATTALION", "battalionId":army_id, "disembarkProvinceId":province_id}})
		return
	var owner := str(target.get("occupierId", target.get("ownerId", "")))
	if owner == "<null>" or owner == "Null": owner = ""
	if not army.get("isFleet", false) and not owner.is_empty() and owner != player_id and not _at_war(owner):
		_war_pending = {"type":"DECLARE_WAR_AND_MOVE", "battalionId":army_id, "targetProvinceId":province_id, "targetRealmId":owner, "casusBelli":"CONQUEST"}
		_war_dialog.dialog_text = "Invadir %s exige guerra formal contra %s.\nA declaração e a marcha serão enviadas juntas." % [target.get("name", "esta região"), _find(state.get("players", []), owner).get("nation", "esta nação")]
		_war_dialog.popup_centered(Vector2i(650, 230))
	else:
		_send({"type":"SUBMIT_ORDER", "order":{"type":"MOVE_BATTALION", "battalionId":army_id, "targetProvinceId":province_id}})

func _refresh_inspector() -> void:
	if not _left.visible or state.is_empty(): return
	var province := _find(state.get("provinces", []), selected_province)
	var army := _find(state.get("battalions", []), selected_battalion)
	var fingerprint := JSON.stringify([province, army, state.get("plannedOrders", []), state.get("turn", 0), _me(), metadata.get("reserved", {}), metadata.get("orderCosts", {})])
	if fingerprint == _inspection_fingerprint: return
	_inspection_fingerprint = fingerprint
	_clear(_left.body)
	if not army.is_empty():
		_draw_army(army, province)
	elif not province.is_empty():
		_draw_province(province)
	else:
		_left.body.add_child(_label("Selecione uma região ou uma miniatura na mesa."))

func _draw_province(province: Dictionary) -> void:
	_left.title_label.text = str(province.get("name", "Região"))
	var own := str(province.get("ownerId", "")) == player_id
	_left.body.add_child(_label("%s · pacificação %s%% · revolta %s%%" % [TERRAIN_NAMES.get(province.get("terrain", ""), "Terra"), _number(province.get("pacification", 0)), _number(province.get("unrest", 0))]))
	_left.body.add_child(_button("Focar câmera", func(): province_focused.emit(str(province.id))))
	for army in state.get("battalions", []):
		if str(army.get("provinceId", "")) == str(province.id):
			_left.body.add_child(_button("%s · %s tropas" % [army.get("name", "Formação"), _unit_count(army)], _inspect_army_from_list.bind(str(army.id))))
	if not own or str(province.get("kind", "")) != "LAND": return
	_left.body.add_child(_label("Construções · apenas Ouro", 23))
	var quotes: Dictionary = metadata.get("orderCosts", {}).get(str(province.id), {})
	for building in BUILDING_NAMES:
		var level := int(province.get(BUILDING_FIELDS[building], 0))
		var quote: Dictionary = quotes.get("build", {}).get(building, {})
		var gold := float(quote.get("gold", -1))
		var caption := "%s N%s → N%s · %s Ouro" % [BUILDING_NAMES[building], level, level + 1, _number(gold) if gold >= 0 else "…"]
		var button := _button(caption, _send.bind({"type":"SUBMIT_ORDER", "order":{"type":"BUILD_BUILDING", "provinceId":province.id, "building":building}}))
		button.disabled = not _orders_open() or gold < 0 or not quote.get("allowed", true) or not _affordable(quote) or (building == "PORT" and not province.get("isCoastal", false)) or level >= (3 if building == "FORT" else 2)
		button.tooltip_text = "A ordem desta cidade é substituída; ordens de outras cidades permanecem. Sem custo de Autoridade ou Recrutas."
		_left.body.add_child(button)
	_left.body.add_child(_label("Recrutamento", 23))
	var available_units: Array = ["infantry", "cavalry", "artillery"]
	if int(province.get("portLevel", 0)) > 0: available_units.append_array(["warships", "transports"])
	for unit in available_units:
		var quote: Dictionary = quotes.get("recruit", {}).get(unit, {})
		var button := _button("+1 %s · %s Ouro + %s Recruta(s)" % [UNIT_NAMES[unit], _number(quote.get("gold", 0)), _number(quote.get("manpower", 0))], _recruit.bind(str(province.id), unit))
		button.disabled = not _orders_open() or quote.is_empty() or not _affordable(quote)
		_left.body.add_child(button)
	_left.body.add_child(_button("Pacificar região", _send.bind({"type":"SUBMIT_ORDER", "order":{"type":"PACIFY", "provinceId":province.id}})))

func _draw_army(army: Dictionary, province: Dictionary) -> void:
	_left.title_label.text = str(army.get("name", "Formação"))
	_left.body.add_child(_label("%s · %s unidades" % [province.get("name", "Em marcha"), _unit_count(army)], 24))
	_left.body.add_child(_label("Moral %s · Treinamento %s\nInf %s / Cav %s / Art %s · Guerra %s / Transp %s" % [_number(army.get("morale", 0)), _number(army.get("training", 1)), army.get("infantry", 0), army.get("cavalry", 0), army.get("artillery", 0), army.get("warships", 0), army.get("transports", 0)]))
	var morale := ProgressBar.new()
	morale.value = float(army.get("morale", 0))
	morale.custom_minimum_size.y = 18
	_left.body.add_child(morale)
	_left.body.add_child(_button("Focar esta formação", func(): province_focused.emit(str(army.provinceId))))
	if str(army.get("ownerId", "")) != player_id: return
	_left.body.add_child(_label("Botão direito no destino para marchar ou atacar. As ordens de outros batalhões são preservadas."))
	for action in [["ENTRENCH_BATTALION", "Entrincheirar"], ["TRAIN_BATTALION", "Treinar · 6 Ouro"], ["ASSAULT_SIEGE", "Assaltar cerco"]]:
		var button := _button(str(action[1]), _send.bind({"type":"SUBMIT_ORDER", "order":{"type":action[0], "battalionId":army.id}}))
		button.disabled = not _orders_open()
		_left.body.add_child(button)
	_left.body.add_child(_button("Cancelar ordem desta formação", _send.bind({"type":"CANCEL_ORDER", "key":"army:" + str(army.id)})))
	if not army.get("isFleet", false) and str(army.get("embarkedOnId", "")).is_empty():
		for fleet in state.get("battalions", []):
			if fleet.get("isFleet", false) and str(fleet.get("ownerId", "")) == player_id and int(fleet.get("transports", 0)) > 0:
				_left.body.add_child(_button("Embarcar em %s" % fleet.get("name", "frota"), _send.bind({"type":"SUBMIT_ORDER", "order":{"type":"EMBARK_BATTALION", "battalionId":army.id, "fleetId":fleet.id}})))

func _refresh_right() -> void:
	if not _right.visible or state.is_empty(): return
	var fingerprint := JSON.stringify([_right_tab, state.get("turn", 0), state.get("plannedOrders", []), state.get("log", []), state.get("players", []), state.get("offers", []), state.get("wars", [])])
	if fingerprint == _right_fingerprint: return
	_right_fingerprint = fingerprint
	_clear(_right.body)
	match _right_tab:
		"armies": _draw_armies()
		"nation": _draw_nation()
		"diplomacy": _draw_diplomacy()
		_: _draw_chronicle()

func _draw_chronicle() -> void:
	_right.title_label.text = "Crônica / Ordens"
	_right.body.add_child(_label("Ordens preparadas", 24))
	for order in state.get("plannedOrders", []):
		var row := HBoxContainer.new()
		_right.body.add_child(row)
		var key := _order_key(order)
		var target_name := str(order.get("provinceId", order.get("targetProvinceId", "")))
		target_name = str(_find(state.get("provinces", []), target_name).get("name", target_name))
		if order.has("battalionId"): target_name = str(_find(state.get("battalions", []), str(order.battalionId)).get("name", target_name))
		var action_name := str(ORDER_NAMES.get(str(order.get("type", "")), "Ordem preparada"))
		if str(order.get("type", "")) == "BUILD_BUILDING": action_name = "Construir " + str(BUILDING_NAMES.get(order.get("building", ""), "edifício"))
		if str(order.get("type", "")) == "DEMOLISH_BUILDING": action_name = "Demolir " + str(BUILDING_NAMES.get(order.get("building", ""), "edifício"))
		if str(order.get("type", "")) == "DIPLOMACY": action_name = "Negociação diplomática"
		var label := _label("%s · %s" % [action_name, target_name], 16)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		row.add_child(_button("×", _send.bind({"type":"CANCEL_ORDER", "key":key})))
	if state.get("plannedOrders", []).is_empty(): _right.body.add_child(_label("Nenhuma ordem. Clique numa cidade ou formação."))
	_right.body.add_child(_label("Últimos acontecimentos", 24))
	var entries: Array = state.get("log", [])
	for index in range(entries.size() - 1, maxi(-1, entries.size() - 16), -1):
		var entry: Dictionary = entries[index]
		_right.body.add_child(_label("R%s · %s" % [entry.get("turn", ""), entry.get("text", entry.get("message", ""))], 16))

func _draw_armies() -> void:
	_right.title_label.text = "Exércitos e armadas"
	for army in state.get("battalions", []):
		if str(army.get("ownerId", "")) == player_id:
			_right.body.add_child(_button("%s · %s tropas · moral %s" % [army.get("name", "Formação"), _unit_count(army), _number(army.get("morale", 0))], _inspect_army_from_list.bind(str(army.id))))
	_right.body.add_child(_label("Selecione uma formação e clique com o botão direito em qualquer região ou miniatura de destino."))

func _draw_nation() -> void:
	var me := _me()
	_right.title_label.text = str(me.get("nation", "Minha nação"))
	var faith_name := str(schema.get("religions", {}).get(str(me.get("faith", "")), {}).get("name", me.get("faith", "")))
	_right.body.add_child(_label("%s · %s" % [me.get("name", ""), faith_name], 24))
	var rename := LineEdit.new()
	rename.placeholder_text = "Novo nome do jogador"
	rename.max_length = 24
	_right.body.add_child(rename)
	_right.body.add_child(_button("Alterar nome", func(): _send({"type":"SET_PLAYER_NAME", "name":rename.text})))
	var eco: Dictionary = metadata.get("economy", {})
	_right.body.add_child(_label("Receita %s · Manutenção %s · Saldo %s\nReserva de recrutas %s / %s · ganho %s" % [_number(eco.get("income", 0)), _number(eco.get("upkeep", 0)), _number(eco.get("net", 0)), _number(me.get("manpower", 0)), _number(eco.get("manpowerCap", me.get("manpowerCap", 0))), _number(eco.get("manpower", 0))]))
	var active = me.get("activeDilemma")
	if active is Dictionary:
		for dilemma in schema.get("dilemmas", []):
			if str(dilemma.get("id", "")) != str(active.get("id", "")): continue
			_right.body.add_child(_label(str(dilemma.get("name", "Conselho")), 24))
			_right.body.add_child(_label(str(dilemma.get("description", ""))))
			var options: Array = dilemma.get("options", [])
			for index in range(options.size()):
				var option: Dictionary = options[index]
				_right.body.add_child(_button("%s\n%s\nOuro %s · Recrutas %s · Autoridade %s · %s rodadas" % [option.get("label", ""), option.get("text", ""), option.get("gold", 0), option.get("manpower", 0), option.get("authority", 0), option.get("duration", 0)], _send.bind({"type":"CHOOSE_DILEMMA", "option":index})))
	for effect in me.get("councilEffects", []):
		if int(effect.get("expiresTurn", 0)) >= int(state.get("turn", 1)):
			_right.body.add_child(_label("%s · até R%s" % [effect.get("label", ""), effect.get("expiresTurn", 0)]))
	_right.body.add_child(_label("Objetivos secretos", 24))
	for objective in me.get("secretObjectives", []):
		var text := str(objective.get("name", "Objetivo"))
		for requirement in objective.get("requirements", []): text += "\n" + str(requirement.get("label", ""))
		if str(me.get("selectedObjectiveId", "")) == str(objective.get("id", "")): text = "✓ " + text
		_right.body.add_child(_button(text, _send.bind({"type":"CHOOSE_SECRET_OBJECTIVE", "objectiveId":objective.id})))
	_right.body.add_child(_label("Doutrinas militares", 24))
	for skill in schema.get("skills", []):
		var unlocked: bool = str(skill.get("id", "")) in me.get("unlockedSkills", [])
		var button := _button(("✓ " if unlocked else "") + str(skill.get("name", "Doutrina")) + " · " + str(skill.get("cost", 0)) + " Autoridade", _send.bind({"type":"UNLOCK_SKILL", "skillId":skill.id}))
		button.tooltip_text = str(skill.get("description", ""))
		button.disabled = unlocked or not _orders_open() or _authority(me) < float(skill.get("cost", 0))
		_right.body.add_child(button)
	if str(state.get("phase", "")) == "finished":
		_right.body.add_child(_label("Campanha encerrada · " + str(state.get("finishReason", "")), 24))
		if str(state.get("hostId", "")) == player_id:
			_right.body.add_child(_button("Continuar em sandbox", _send.bind({"type":"CONTINUE_SANDBOX"})))

func _draw_diplomacy() -> void:
	_right.title_label.text = "Diplomacia"
	for offer in state.get("offers", []):
		if str(offer.get("to", "")) != player_id: continue
		_right.body.add_child(_label("Oferta de %s" % [_find(state.get("players", []), str(offer.get("from", ""))).get("nation", "")]))
		var row := HBoxContainer.new()
		_right.body.add_child(row)
		row.add_child(_button("Aceitar", _send.bind({"type":"ANSWER_OFFER", "offerId":offer.id, "accept":true})))
		row.add_child(_button("Recusar", _send.bind({"type":"ANSWER_OFFER", "offerId":offer.id, "accept":false})))
	for player in state.get("players", []):
		var target_id := str(player.get("id", ""))
		if target_id == player_id: continue
		_right.body.add_child(_label("%s · %s" % [player.get("nation", ""), player.get("name", "")], 23))
		if not _at_war(target_id):
			_right.body.add_child(_button("Propor aliança", _send.bind({"type":"SUBMIT_ORDER", "order":{"type":"DIPLOMACY", "action":"PROPOSE_ALLIANCE", "targetRealmId":target_id}})))
			_right.body.add_child(_button("Conquista Imperial · declarar guerra", _declare_war.bind(target_id, "CONQUEST")))
			_right.body.add_child(_button("Guerra religiosa · declarar guerra", _declare_war.bind(target_id, "HOLY_WAR")))
		else:
			_right.body.add_child(_label("Em guerra"))
			for war in state.get("wars", []):
				if war.get("active", false) and target_id in (war.get("attackerIds", []) + war.get("defenderIds", [])) and player_id in (war.get("attackerIds", []) + war.get("defenderIds", [])):
					_right.body.add_child(_label("Pontuação %s" % war.get("warScore", 0)))
					_right.body.add_child(_button("Oferecer paz branca", _send.bind({"type":"OFFER_PEACE", "warId":war.id, "terms":[{"type":"WHITE_PEACE"}]})))
	_right.body.add_child(_label("O servidor valida pactos, tréguas e condições dos casus belli antes de declarar a guerra."))

func _declare_war(target: String, cb: String) -> void:
	if _can_order(): war_requested.emit(target, cb, [])

func _recruit(province_id: String, unit: String) -> void:
	if not _can_order(): return
	var order: Dictionary = {"type":"RECRUIT_BATTALION", "provinceId":province_id, unit:1}
	order["isFleet"] = unit in ["warships", "transports"]
	# Add to this city's existing regular recruitment without losing its composition.
	for existing in state.get("plannedOrders", []):
		if str(existing.get("type", "")) == "RECRUIT_BATTALION" and str(existing.get("provinceId", "")) == province_id and bool(existing.get("isFleet", false)) == bool(order.isFleet):
			order = existing.duplicate(true)
			order[unit] = int(order.get(unit, 0)) + 1
	_send({"type":"SUBMIT_ORDER", "order":order})

func _order_key(order: Dictionary) -> String:
	if str(order.get("type", "")) == "DIPLOMACY": return "diplomacy:%s:%s" % [order.get("action", ""), order.get("targetRealmId", "")]
	if order.has("battalionId") and str(order.get("type", "")) != "RECRUIT_BATTALION": return "army:" + str(order.battalionId)
	return "city:" + str(order.get("targetProvinceId", "") if str(order.get("type", "")) == "CONVERT" else order.get("provinceId", ""))

func _open_right(tab: String) -> void:
	_right_tab = tab
	_right_fingerprint = ""
	_right.show()
	_right.move_to_front()
	_refresh_right()

func _inspect_army_from_list(army_id: String) -> void:
	battalion_focused.emit(army_id)

func _toggle_ready() -> void:
	ready_requested.emit(not bool(_me().get("ready", false)))

func _connect_server() -> void:
	connect_requested.emit(_server.text)

func _nation_id() -> String:
	return str(_nation.get_item_metadata(_nation.selected)) if _nation.item_count > 0 else "vespera"

func _create_room() -> void:
	create_requested.emit(_name.text.strip_edges(), _nation_id(), _public.button_pressed)

func _join_room() -> void:
	join_requested.emit(_code.text.strip_edges(), _name.text.strip_edges(), _nation_id())

func _disconnect() -> void:
	disconnect_requested.emit()

func _send(command: Dictionary) -> void:
	command_requested.emit(command)

func _orders_open() -> bool:
	return str(state.get("phase", "")) == "planning" and not bool(_me().get("ready", false))

func _can_order() -> bool:
	if not _orders_open():
		show_error("Reabra suas ordens durante o planejamento antes de agir.")
		return false
	return true

func _at_war(other: String) -> bool:
	for war in state.get("wars", []):
		if not war.get("active", false): continue
		if player_id in war.get("attackerIds", []) and other in war.get("defenderIds", []): return true
		if player_id in war.get("defenderIds", []) and other in war.get("attackerIds", []): return true
	return false

func _affordable(quote: Dictionary) -> bool:
	var reserved: Dictionary = metadata.get("reserved", {})
	var me := _me()
	return float(me.get("gold", 0)) - float(reserved.get("gold", 0)) + 0.0000001 >= float(quote.get("gold", 0)) and float(me.get("manpower", 0)) - float(reserved.get("manpower", 0)) >= float(quote.get("manpower", 0)) and _authority(me) - float(reserved.get("influence", 0)) >= float(quote.get("influence", 0))

func _me() -> Dictionary:
	return _find(state.get("players", []), player_id)

func _find(items: Array, id: String) -> Dictionary:
	for item in items:
		if str(item.get("id", "")) == id: return item
	return {}

func _authority(player: Dictionary) -> float:
	return float(player.get("authority", maxf(0, floor(float(player.get("influence", 0)) + float(player.get("prestige", 0)) + float(player.get("militaryXP", 0))))))

func _unit_count(army: Dictionary) -> int:
	var total := 0
	for unit in UNIT_NAMES: total += int(army.get(unit, 0))
	return total

func _number(value) -> String:
	return ("%.2f" % float(value)).trim_suffix("0").trim_suffix("0").trim_suffix(".").replace(".", ",")

func _label(text: String, font_size := 18) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	return label

func _button(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.custom_minimum_size.y = 42
	button.pressed.connect(action)
	return button

func _toolbar_button(text: String, action: Callable) -> Button:
	var button := _button(text, action)
	button.autowrap_mode = TextServer.AUTOWRAP_OFF
	return button

func _clear(container: Node) -> void:
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()
