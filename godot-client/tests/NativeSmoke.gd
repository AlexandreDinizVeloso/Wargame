extends SceneTree
## Live HTTP integration of the real scene, HUD commands, private views and 3D props.
## Run against a disposable server, with an isolated XDG_DATA_HOME / user directory.
const MainScene = preload("res://scenes/MainWarRoom.tscn")
const Network = preload("res://scripts/NetworkClient.gd")
var main_scene: Node
var guest: Node
var failures: Array[String] = []
var capture_enabled := false

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var server := "http://127.0.0.1:3011"
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--server="): server = argument.trim_prefix("--server=")
		if argument == "--capture": capture_enabled = true
	main_scene = MainScene.instantiate()
	root.add_child(main_scene)
	var net = main_scene.get_node("NetworkClient")
	var hud = main_scene.get_node("HUD")
	var table = main_scene.get_node("WarTable")
	net.request_failed.connect(func(message: String): failures.append(message))
	net.connect_server(server)
	if not await _until(func(): return not net.bootstrap.is_empty(), "bootstrap"): return
	if not _check(table._territories.size() == 42, "42 territórios 3D carregados"): return
	if not _check(hud._nation.item_count == 8, "oito nações no lobby nativo"): return
	hud._name.text = "Godot Host"
	for index in range(hud._nation.item_count):
		if str(hud._nation.get_item_metadata(index)) == "turan": hud._nation.select(index)
	hud._create_room()
	if not await _until(func(): return str(net.state.get("phase", "")) == "lobby", "criação de sala"): return
	var room_code := str(net.session.code)
	var host_id := str(net.session.playerId)
	guest = Network.new()
	root.add_child(guest)
	guest.request_failed.connect(func(message: String): failures.append(message))
	guest.connect_server(server)
	if not await _until(func(): return not guest.bootstrap.is_empty(), "bootstrap convidado"): return
	guest.join_room(room_code, "Godot Guest", "vespera")
	if not await _until(func(): return not guest.state.is_empty() and str(guest.session.get("playerId", "")) != host_id, "entrada de convidado"): return
	hud._send({"type":"ADD_BOT"})
	if not await _until(func(): return net.state.get("players", []).size() == 3, "adição de bot"): return
	hud._send({"type":"START_GAME"})
	if not await _until(func(): return str(net.state.get("phase", "")) == "planning", "início da campanha"): return
	if not _check(net.metadata.has("reserved") and net.metadata.has("orderCosts"), "cotações e reservas vêm do servidor"): return
	var cities: Array[String] = []
	var armies: Array[Dictionary] = []
	for province in net.state.provinces:
		if str(province.get("ownerId", "")) == host_id: cities.append(str(province.id))
	for army in net.state.battalions:
		if str(army.get("ownerId", "")) == host_id and not army.get("isFleet", false): armies.append(army)
	if not _check(cities.size() >= 2 and armies.size() >= 2, "duas cidades e dois batalhões próprios"): return
	for city_id in cities.slice(0, 2):
		hud.inspect_province(city_id)
		if not _check(float(net.metadata.orderCosts[city_id].build.MARKET.gold) == 20, "Mercado inicial20 sem custo oculto"): return
		hud._send({"type":"SUBMIT_ORDER", "order":{"type":"BUILD_BUILDING", "provinceId":city_id, "building":"MARKET"}})
	if not await _until(func(): return net.state.get("plannedOrders", []).size() == 2, "dois Mercados independentes"): return
	if not _check(float(net.metadata.reserved.gold) == 40 and "Ourodisponível0" in hud._resources.text.replace(" ", ""), "HUD mostra zero livre após20+20"): return
	main_scene._select_army(str(armies[0].id))
	hud.request_move(str(armies[0].id), str(armies[1].provinceId))
	main_scene._select_army(str(armies[1].id))
	hud.request_move(str(armies[1].id), str(armies[0].provinceId))
	if not await _until(func(): return net.state.get("plannedOrders", []).size() == 4, "dois movimentos preservam ambas construções"): return
	var first_key := "army:" + str(armies[0].id)
	hud._send({"type":"CANCEL_ORDER", "key":first_key})
	if not await _until(func(): return net.state.get("plannedOrders", []).size() == 3, "cancelamento exato"): return
	var remaining_moves := 0
	for order in net.state.plannedOrders:
		if str(order.get("type", "")) == "MOVE_BATTALION": remaining_moves += 1
	if not _check(remaining_moves == 1 and float(net.metadata.reserved.gold) == 40, "cancelar A preserva B e40Ouro reservados"): return
	hud.request_move(str(armies[0].id), str(armies[1].provinceId))
	if not await _until(func(): return net.state.get("plannedOrders", []).size() == 4, "restaurar movimentoA"): return
	hud._toggle_ready()
	guest.set_ready(true)
	if not await _until(func(): return int(net.state.get("turn", 0)) == 2, "resolução simultânea"): return
	var markets := 0
	for city_id in cities.slice(0, 2):
		if int(_find(net.state.provinces, city_id).get("marketLevel", 0)) == 1: markets += 1
	if not _check(markets == 2, "ambos Mercados foram construídos na mesma rodada"): return
	var host_movements := 0
	for move in net.state.get("lastReport", {}).get("movements", []):
		if str(move.get("ownerId", "")) == host_id: host_movements += 1
	if not _check(host_movements == 2, "ambos batalhões marcharam"): return
	if not _check(table._armies.size() > 0 and table._structures.size() >= 2, "props3D sincronizados após resolução"): return
	await process_frame
	if not _check(hud._topbar.size.y <= 160 and hud._topbar.size.x <= 1900, "barra compacta não cobre o mapa"): return
	if not _check(hud._brand.get_line_count() == 1 and hud._brand.size.x >= 280, "título horizontal legível"): return
	if not _check(hud._resources.get_line_count() == 1 and hud._resources.size.x >= 650, "recursos em uma linha legível"): return
	if not _check(hud._ready_button.size.y <= 64 and hud._connection.get_line_count() == 1, "botão e conexão compactos"): return
	if capture_enabled:
		if not await _until(func(): return not main_scene.get_node("Cinematics")._active, "fim da transição inicial"): return
		hud._open_right("chronicle")
		await _capture("godot-v110-native-game.png")
	for expected_turn in [3, 4]:
		hud._toggle_ready()
		guest.set_ready(true)
		if not await _until(func(): return int(net.state.get("turn", 0)) >= expected_turn, "avançar rodada%s" % expected_turn): return
	if not _check(str(net.state.season) == "SUMMER" and "VERÃO1/3" in hud._season.text.replace(" ", ""), "verão iniciaR4 ewidget1/3"): return
	var me := _find(net.state.players, host_id)
	if not _check(me.get("activeDilemma") is Dictionary, "Conselho privado disponívelR4"): return
	hud._open_right("nation")
	hud._send({"type":"CHOOSE_DILEMMA", "option":0})
	if not await _until(func(): return not (_find(net.state.players, host_id).get("activeDilemma") is Dictionary), "escolha do Conselho"): return
	hud._declare_war(str(guest.session.playerId), "CONQUEST")
	if not await _until(func(): return net.state.get("wars", []).size() >= 1, "declaração de guerra nativa"): return
	if not await _until(func(): return main_scene.get_node("Cinematics")._title.text == "GUERRA DECLARADA", "cutscene3D de guerra"): return
	if not _check(main_scene.get_node("Cinematics")._shields_root.get_child_count() == 2, "dois brasões3D reais"): return
	if capture_enabled:
		await create_timer(0.8).timeout
		await _capture("godot-v110-native-war.png")
	if not _check(hud._left.visible and hud._right.visible, "inspetor e Crônica independentes"): return
	if not _check(failures.is_empty(), "sem errosHTTP ou regras: " + "; ".join(failures)): return
	net.leave_local_session()
	guest.leave_local_session()
	await create_timer(0.25).timeout
	print("NATIVE_SMOKE_PASS: realMainScene+HTTP host/join/bot/start,20+20costs, exactHUD/reservations, twoarmyorders/cancel/movement,3Dprops,3turnseasons,council,war3Dcutscene,independentpanels")
	main_scene.queue_free()
	guest.queue_free()
	await process_frame
	quit(0)

func _capture(filename: String) -> void:
	if DisplayServer.get_name() == "headless":
		_check(false, "--capture exige renderizador gráfico, não --headless")
		return
	await RenderingServer.frame_post_draw
	var folder := ProjectSettings.globalize_path("res://").path_join("../.local/screenshots").simplify_path()
	DirAccess.make_dir_recursive_absolute(folder)
	var image := root.get_texture().get_image()
	_check(not image.is_empty() and image.save_png(folder.path_join(filename)) == OK, "salvar captura " + filename)

func _until(predicate: Callable, label: String) -> bool:
	var limit := Time.get_ticks_msec() + 18000
	while Time.get_ticks_msec() < limit:
		if predicate.call(): return true
		await process_frame
	return _check(false, "timeout: " + label + " / " + "; ".join(failures))

func _check(value: bool, label: String) -> bool:
	if not value:
		push_error("NATIVE_SMOKE_FAIL: " + label)
		quit(1)
	return value

func _find(items: Array, id: String) -> Dictionary:
	for item in items:
		if str(item.get("id", "")) == id: return item
	return {}
