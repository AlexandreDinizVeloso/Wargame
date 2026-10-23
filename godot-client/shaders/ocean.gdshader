shader_type spatial;
render_mode cull_back;

uniform vec4 deep_color : source_color = vec4(0.035, 0.16, 0.22, 1.0);
uniform vec4 crest_color : source_color = vec4(0.15, 0.36, 0.39, 1.0);
uniform float wave_strength = 0.012;
varying vec3 world_position;

void vertex() {
	VERTEX.y += sin(VERTEX.x * 1.8 + TIME * 0.45) * wave_strength;
	VERTEX.y += cos(VERTEX.z * 2.7 - TIME * 0.28) * wave_strength * 0.55;
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float broad = sin(world_position.x * 0.65 + world_position.z * 0.3 + TIME * 0.2) * 0.5 + 0.5;
	float ripple = sin(world_position.z * 6.0 + world_position.x * 0.2 - TIME * 0.5) * 0.5 + 0.5;
	ALBEDO = mix(deep_color.rgb, crest_color.rgb, broad * 0.05 + ripple * 0.025);
	ROUGHNESS = 0.75;
	METALLIC = 0.02;
	SPECULAR = 0.2;
}
