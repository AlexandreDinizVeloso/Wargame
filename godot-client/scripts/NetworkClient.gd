extends Node
## HTTP adapter for the same authenticated GameView and commands as the web client.
## Requests are serialized: polls can never overwrite a newer command response.
signal bootstrap_received(data: Dictionary)
signal state_received(state: Dictionary, metadata: Dictionary)
signal rooms_received(rooms: Array)
signal session_changed(session: Dictionary)
signal connection_changed(status: String)
signal request_failed(message: String)
signal busy_changed(busy: bool)

const CREDENTIAL_FILE := "user://concordia-session.cfg"
const POLL_SECONDS := 1.0
var base_url := "http://localhost:3000"
var session: Dictionary = {}
var state: Dictionary = {}
var metadata: Dictionary = {}
var bootstrap: Dictionary = {}
var status := "offline"
var _http: HTTPRequest
var _poll: Timer
var _queue: Array[Dictionary] = []
var _current: Dictionary = {}
var _poll_enabled := false
var _retry_count := 0

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 12.0
	add_child(_http)
	_http.request_completed.connect(_completed)
	_poll = Timer.new()
	_poll.wait_time = POLL_SECONDS
	_poll.timeout.connect(_poll_state)
	add_child(_poll)
	_load_credentials()

func connect_server(url: String) -> void:
	var cleaned := url.strip_edges().trim_suffix("/")
	if not (cleaned.begins_with("http://") or cleaned.begins_with("https://")):
		request_failed.emit("Informe uma URL http:// ou https:// para o servidor.")
		return
	if cleaned != base_url:
		_http.cancel_request()
		_queue.clear()
		_current.clear()
		_poll.stop()
		_poll_enabled = false
		state.clear()
		if str(session.get("server", "")) != cleaned:
			session = {}
	base_url = cleaned
	_set_status("connecting")
	_enqueue("bootstrap", HTTPClient.METHOD_GET, "/api/bootstrap", {}, false)

func refresh_rooms() -> void:
	_enqueue("rooms", HTTPClient.METHOD_GET, "/api/rooms", {}, false)

func create_room(player_name: String, nation_id: String, public_room := false) -> void:
	_enqueue("session", HTTPClient.METHOD_POST, "/api/rooms", {
		"name": player_name, "nationId": nation_id, "mode": "campaign",
		"isPublic": public_room, "roomName": "Mesa 3D de " + player_name,
		"turnTimerSeconds": 90,
	}, false)

func join_room(code: String, player_name: String, nation_id: String) -> void:
	var room_code := code.strip_edges().to_upper()
	if room_code.is_empty():
		request_failed.emit("Informe o código da sala.")
		return
	_enqueue("session", HTTPClient.METHOD_POST, "/api/rooms/" + room_code.uri_encode() + "/join", {
		"name": player_name, "nationId": nation_id,
	}, false)

func resume_session() -> void:
	if not has_session():
		request_failed.emit("Não há credencial salva neste computador. Entre pelo código da sala.")
		return
	_enqueue("session", HTTPClient.METHOD_POST, _room_path("resume"), {
		"playerId": session.get("playerId", ""), "token": session.get("token", ""),
	}, false)

func send_command(command: Dictionary) -> void:
	if not has_session() or state.is_empty():
		request_failed.emit("Entre em uma sala antes de enviar ordens.")
		return
	_enqueue("command", HTTPClient.METHOD_POST, _room_path("commands"), {"command": command}, true)

func set_ready(value: bool) -> void:
	_enqueue("command", HTTPClient.METHOD_POST, _room_path("ready"), {"ready": value}, true)

func declare_war(target_id: String, casus_belli: String, allies: Array = []) -> void:
	_enqueue("command", HTTPClient.METHOD_POST, _room_path("declare-war"), {
		"targetRealmId": target_id, "casusBelli": casus_belli, "offensiveAllyIds": allies,
	}, true)

func leave_local_session() -> void:
	_poll_enabled = false
	_poll.stop()
	_http.cancel_request()
	_current.clear()
	_queue.clear()
	if has_session(): _enqueue("leave", HTTPClient.METHOD_POST, _room_path("leave"), {}, true)
	state = {}
	# Keep the private recovery credential on disk; only disconnect this viewport.
	state_received.emit({}, {})

func has_session() -> bool:
	return not str(session.get("code", "")).is_empty() and not str(session.get("token", "")).is_empty()

func is_busy() -> bool:
	return not _current.is_empty() or not _queue.is_empty()

func _room_path(suffix: String) -> String:
	return "/api/rooms/" + str(session.get("code", "")).uri_encode() + "/" + suffix

func _poll_state() -> void:
	if _poll_enabled and has_session() and _current.is_empty() and _queue.is_empty():
		_enqueue("poll", HTTPClient.METHOD_GET, _room_path("state"), {}, true)

func _enqueue(kind: String, method: int, route: String, data: Dictionary, authenticated: bool) -> void:
	if authenticated and not has_session():
		request_failed.emit("A sessão privada é necessária para esta ação.")
		return
	_queue.append({"kind": kind, "method": method, "route": route, "body": data, "auth": authenticated})
	_drain()

func _drain() -> void:
	if not _current.is_empty() or _queue.is_empty():
		return
	_current = _queue.pop_front()
	var headers := PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if _current.get("auth", false):
		headers.append("Authorization: Bearer " + str(session.get("token", "")))
		headers.append("X-Concordia-Player: " + str(session.get("playerId", "")))
	var body := "" if int(_current.method) == HTTPClient.METHOD_GET else JSON.stringify(_current.body)
	busy_changed.emit(true)
	var result := _http.request(base_url + str(_current.route), headers, int(_current.method), body)
	if result != OK:
		_current.clear()
		_set_status("offline")
		request_failed.emit("Não foi possível iniciar a conexão: " + error_string(result))
		busy_changed.emit(false)
		call_deferred("_drain")

func _completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var request := _current.duplicate()
	_current.clear()
	var decoder := JSON.new()
	var parse_error := decoder.parse(body.get_string_from_utf8())
	var parsed = decoder.data if parse_error == OK else null
	var payload: Dictionary = parsed if parsed is Dictionary else {}
	var malformed := result == HTTPRequest.RESULT_SUCCESS and code >= 200 and code < 300 and parse_error != OK
	if result != HTTPRequest.RESULT_SUCCESS or code < 200 or code >= 300 or malformed:
		var detail := str(payload.get("error", "Servidor indisponível. Confira a URL e mantenha npm run dev/start aberto."))
		if malformed: detail = "O servidor não enviou JSON. Use o servidor Concórdia v1.1 ou mais recente nesta URL."
		if code == 401 or code == 404 or code == 410:
			_poll_enabled = false
			_poll.stop()
			_set_status("recovery")
		elif result != HTTPRequest.RESULT_SUCCESS or code >= 500 or malformed:
			_set_status("offline")
			_retry_count += 1
			_poll.wait_time = minf(8.0, POLL_SECONDS * pow(2, mini(_retry_count, 3)))
		# Avoid one toast every poll during an outage. Never retry POST automatically.
		if str(request.get("kind", "")) != "poll" or _retry_count <= 1:
			request_failed.emit(detail)
	else:
		_retry_count = 0
		_poll.wait_time = POLL_SECONDS
		_set_status("online")
		var kind := str(request.get("kind", ""))
		if kind == "bootstrap":
			bootstrap = payload
			bootstrap_received.emit(bootstrap)
			refresh_rooms()
		elif kind == "rooms":
			var rooms: Array = parsed if parsed is Array else payload.get("rooms", [])
			rooms_received.emit(rooms)
		elif kind == "leave":
			pass
		else:
			if kind == "session":
				session = {"code": payload.get("code", ""), "playerId": payload.get("playerId", ""), "token": payload.get("token", ""), "server": base_url}
				_save_credentials()
				session_changed.emit(session.duplicate())
				_poll_enabled = true
				_poll.start()
			var next_state = payload.get("state", payload.get("game", {}))
			if next_state is Dictionary and not next_state.is_empty():
				state = next_state
				metadata = payload.duplicate()
				metadata.erase("state")
				metadata.erase("game")
				metadata.erase("token")
				state_received.emit(state, metadata)
	busy_changed.emit(false)
	call_deferred("_drain")

func _set_status(next: String) -> void:
	if status != next:
		status = next
		connection_changed.emit(status)

func _save_credentials() -> void:
	var config := ConfigFile.new()
	for key in session:
		config.set_value("session", key, session[key])
	if config.save(CREDENTIAL_FILE) != OK:
		request_failed.emit("Não foi possível salvar a credencial local. Anote o código e mantenha o cliente aberto.")
		return
	if OS.get_name() != "Windows":
		FileAccess.set_unix_permissions(CREDENTIAL_FILE, FileAccess.UNIX_READ_OWNER | FileAccess.UNIX_WRITE_OWNER)

func _load_credentials() -> void:
	var config := ConfigFile.new()
	if config.load(CREDENTIAL_FILE) != OK:
		return
	for key in ["code", "playerId", "token", "server"]:
		session[key] = str(config.get_value("session", key, ""))
	base_url = str(session.get("server", base_url))
	if base_url.is_empty():
		base_url = "http://localhost:3000"
