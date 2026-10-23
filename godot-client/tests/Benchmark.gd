extends SceneTree
## Real renderer benchmark. Run without browser smokes for an isolated measurement.
## DISPLAY=:197 godot --audio-driver Dummy --path godot-client --script res://tests/Benchmark.gd
var _table: Node3D

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("The benchmark requires a real graphics display, not --headless.")
		quit(1)
		return
	root.size = Vector2i(1440, 810)
	_table = load("res://scripts/WarTable3D.gd").new()
	root.add_child(_table)
	await process_frame
	var bootstrap: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/bootstrap.json"))
	var game := {"code":"BENCH", "turn":1, "season":"SPRING", "players":[], "provinces":bootstrap.map.duplicate(true), "battalions":[]}
	var homes := ["castile", "arabia", "south-africa", "nile", "scandinavia", "mongolia", "china-east", "brazil"]
	var colors := ["#397a98", "#aa4b48", "#d5aa54", "#8d65a3", "#4f926a", "#ac7961", "#608db6", "#b280a7"]
	var seas: Array = game.provinces.filter(func(p): return str(p.get("kind", "")) == "SEA_ZONE")
	for index in range(8):
		var owner := "p" + str(index)
		game.players.append({"id":owner, "color":colors[index]})
		for province in game.provinces:
			if str(province.id) == homes[index]:
				province.ownerId = owner
				province.fortLevel = 1
				province.marketLevel = 1
		for formation in range(2):
			game.battalions.append({"id":"army%s-%s" % [index, formation], "ownerId":owner, "provinceId":homes[index], "infantry":4, "cavalry":2 if formation == 1 else 0, "artillery":2 if formation == 0 else 0, "morale":90, "isFleet":false})
		game.battalions.append({"id":"fleet%s" % index, "ownerId":owner, "provinceId":seas[index].id, "warships":3, "transports":2, "morale":95, "isFleet":true})
	_table.apply_state(game, "p0")
	await create_timer(5.0).timeout
	print("BENCHMARK_DEVICE=", RenderingServer.get_video_adapter_name())
	print("BENCHMARK_SCENE=42 territories,24 formations,16 structures,1440x810")
	for preset in ["high", "balanced", "low"]:
		_table.set_quality(preset)
		await create_timer(2.0).timeout
		var started := Time.get_ticks_usec()
		var frames := 0
		var draws := 0.0
		var primitives := 0.0
		while Time.get_ticks_usec() - started < 5000000:
			await process_frame
			frames += 1
			draws += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
			primitives += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
		var seconds := float(Time.get_ticks_usec() - started) / 1000000.0
		print("BENCHMARK_RESULT=", JSON.stringify({"quality":preset, "fps":snappedf(frames / seconds,0.1), "drawCalls":roundi(draws / maxi(1,frames)), "primitives":roundi(primitives / maxi(1,frames)), "frames":frames, "seconds":snappedf(seconds,0.01)}))
	_table.queue_free()
	await process_frame
	quit(0)
