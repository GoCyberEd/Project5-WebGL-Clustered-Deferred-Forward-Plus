import TextureBuffer from './textureBuffer';

// Import various utils
import {vec4, vec3, mat4} from "gl-matrix";

// Import shared constants
import {NUM_LIGHTS} from "../scene";
import {LIGHT_RADIUS} from "../scene";

export const MAX_LIGHTS_PER_CLUSTER = 100;

export default class BaseRenderer {
    constructor(xSlices, ySlices, zSlices) {
        // Create a texture to store cluster data. 
        // Each cluster stores the number of lights followed by the light indices
        this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MAX_LIGHTS_PER_CLUSTER + 1);
        this._xSlices = xSlices;
        this._ySlices = ySlices;
        this._zSlices = zSlices;
    }

    updateClusters(camera, viewMatrix, scene) {
        // Update the cluster texture with the count and indices of the lights in each cluster

        for (let z = 0; z < this._zSlices; ++z) {
            for (let y = 0; y < this._ySlices; ++y) {
                for (let x = 0; x < this._xSlices; ++x) {
                    let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
                    // Reset the light count to 0 for every cluster
                    this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
                }
            }
        }

        let height = Math.tan(camera.fov * Math.PI / 180 * .5);
        let width  = Math.abs(camera.aspect * height);
        let depth = camera.far - camera.near;
        let depthX = width * 2 / this._xSlices;
        let depthY = height * 2 / this._ySlices;
        let depthZ = depth / this._zSlices; // */
        
        //Loop thru all lights
        console.log("About to loop (" + NUM_LIGHTS + ")");
        for (let i = 0; i < NUM_LIGHTS; i++) {
            //console.log("Looping!");
            let lightPose = vec4.fromValues(
                    scene.lights[i].position[0], 
                    scene.lights[i].position[1], 
                    scene.lights[i].position[2] * -1, 
                    1);
            //Transform light position by the given viewMatrix
            vec4.transformMat4(lightPose, lightPose, viewMatrix);

            let radius = scene.lights[i].radius;

            let cluster = { 
                "x" : {
                    "p" : this._xSlices, 
                    "m" : 0
                },
                "y" : {
                    "p" : this._ySlices,
                    "m" : 0
                },
                "z" : this.calculatePlusMinus(lightPose[2] - camera.near, radius)
            };
            cluster.z.m = Math.max(0, Math.floor(cluster.z.m / depthZ));
            cluster.z.p = Math.min(this._zSlices - 1, Math.floor(cluster.z.p / depthZ));


            // Check if light is visible
            if (cluster.x.m >= this._xSlices || cluster.x.p < 0 ||
                    cluster.y.m >= this._ySlices || cluster.y.p < 0 ||
                    cluster.z.m >= this._zSlices || cluster.z.p < 0) {
                continue;
            }

            // Fine tune min/max by distance
            cluster.x.m = this.tunePlus(0, cluster.x.p, lightPose, radius, width, depthX, this.calculateDistanceX);
            cluster.x.p = this.tuneMinus(cluster.x.p, cluster.x.m, lightPose, radius, width, depthX, this.calculateDistanceX);
            cluster.y.m = this.tunePlus(0, cluster.y.p, lightPose, radius, height, depthY, this.calculateDistanceY);
            cluster.y.p = this.tuneMinus(cluster.y.p, cluster.y.m, lightPose, radius, height, depthY, this.calculateDistanceY);

            /*
            console.log("Cluster: \n" + 
                    "\t x->(" + cluster.x.m + ", " + cluster.x.p + ")\n" + 
                    "\t y->(" + cluster.y.m + ", " + cluster.y.p + ")\n" + 
                    "\t z->(" + cluster.z.m + ", " + cluster.z.p + ")"
                    ); //*/

            for (let x = cluster.x.m; x <= cluster.x.p; x++) {
                for (let y = cluster.y.m; y <= cluster.y.p; y++) {
                    for (let z = cluster.z.m; z <= cluster.z.p; z++) {
                        //console.log("Inside");
                        let idx = x + y * this._xSlices + z * this._xSlices * this._ySlices;
                        let buffIdx = this._clusterTexture.bufferIndex(idx, 0);
                        let clusterLightCount = this._clusterTexture.buffer[buffIdx] + 1;

                        if (clusterLightCount > MAX_LIGHTS_PER_CLUSTER) {
                            // Can we break here instead?
                            break;
                        }

                        let lightIdx = this._clusterTexture.bufferIndex(idx, Math.floor(clusterLightCount / 4));
                        let offset = clusterLightCount - Math.floor(clusterLightCount / 4) * 4; //Fix rounding bug
                        // Update buffer
                        this._clusterTexture.buffer[lightIdx + offset] = i;
                        this._clusterTexture.buffer[buffIdx] = clusterLightCount; //*/
                    }
                }
            }
            
        }

        this._clusterTexture.update();
    }

    tunePlus(initialValue, maxInc, pose, radius, wh, depth, distance) {
        for (var i = initialValue; i <= maxInc; i++) {
            let d = distance(pose, -wh + i * depth);
            if (Math.abs(d) < radius) {
                return i;
            }
        }
        return i;
    }
    tuneMinus(initialValue, minInc, pose, radius, wh, depth, distance) {
        for (var i = initialValue; i >= minInc; i--) {
            let d = distance(pose, -wh + i * depth);
            if (Math.abs(d) < radius) {
                return i;
            }
        }
        return i;
    }

    calculateDistanceX(p, x) {
        return vec3.dot(vec3.fromValues(p[0], p[1], p[2]), 
                vec3.fromValues(1 / Math.sqrt(x * x + 1), 0, -x / Math.sqrt(x * x + 1)));
    }
    calculateDistanceY(p, y) {
        return vec3.dot(vec3.fromValues(p[0], p[1], p[2]), 
                vec3.fromValues(0, 1 / Math.sqrt(y * y + 1), -y / Math.sqrt(y * y + 1)));
    }

    clamp(min, max, value) {
        let aux = Math.max(min, value);
        aux = Math.min(max, aux);
        return aux;
    }

    calculatePlusMinus(left, right, scalar) {
        if (scalar === undefined || scalar === null) {
            scalar = 1;
        }
        return {
            "p" : (left + right) * scalar,
            "m" : (left - right) * scalar
        }
    }
}
