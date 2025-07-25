FROM node:slim AS base
ENV TROUPE=/Troupe
WORKDIR $TROUPE
RUN npm install -g typescript

# Install runtime dependencies for multinode tests
RUN apt-get update && apt-get install -qy procps jq && rm -rf /var/lib/apt/lists/*

# Image for building everything.
FROM base AS builder
ENV TROUPE=/Troupe
WORKDIR $TROUPE

# Copy the files to the container.
COPY . .

# Install packages for building the image.
RUN apt-get update && apt-get install -qy haskell-stack g++

# Build Troupe.
RUN npm install
RUN make rt
RUN make compiler
RUN make p2p-tools
RUN make libs
RUN make service

# Create runner image.
FROM base
ENV TROUPE=/Troupe
WORKDIR $TROUPE

# Copy files from builder image.
COPY --from=builder $TROUPE/bin $TROUPE/bin
COPY --from=builder $TROUPE/examples $TROUPE/examples
COPY --from=builder $TROUPE/lib $TROUPE/lib
COPY --from=builder $TROUPE/p2p-tools $TROUPE/p2p-tools
COPY --from=builder $TROUPE/rt $TROUPE/rt
COPY --from=builder $TROUPE/tests $TROUPE/tests
COPY --from=builder $TROUPE/trp-rt $TROUPE/trp-rt
COPY --from=builder $TROUPE/node_modules $TROUPE/node_modules
COPY --from=builder $TROUPE/local.sh $TROUPE/local.sh
COPY --from=builder $TROUPE/network.sh $TROUPE/network.sh
COPY --from=builder $TROUPE/pini.sh $TROUPE/pini.sh
COPY --from=builder $TROUPE/rollup.config.js $TROUPE/rollup.config.js
COPY --from=builder $TROUPE/trustmap.json $TROUPE/trustmap.json
COPY --from=builder $TROUPE/scripts $TROUPE/scripts
COPY --from=builder $TROUPE/Makefile $TROUPE/Makefile

# Create necessary directories
RUN mkdir -p $TROUPE/out

# Command to overwrite the node image command, that starts in node.
CMD ["bash"]

