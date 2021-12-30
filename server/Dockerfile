FROM ubuntu:20.04

USER root

ENV TZ=Europe/Helsinki

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update && apt-get -y --no-install-recommends install \
    sudo \
    vim \
    wget \
    build-essential \
    pkg-config \
    gdb 

RUN echo "deb http://archive.ubuntu.com/ubuntu/ focal main restricted universe multiverse" >> /etc/apt/sources.list && \
    echo "deb-src http://archive.ubuntu.com/ubuntu/ focal main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb http://archive.ubuntu.com/ubuntu/ focal-updates main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb-src http://archive.ubuntu.com/ubuntu/ focal-updates main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb http://archive.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb-src http://archive.ubuntu.com/ubuntu/ focal-security main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb http://archive.ubuntu.com/ubuntu/ focal-backports main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb-src http://archive.ubuntu.com/ubuntu/ focal-backports main restricted universe multiverse"  >> /etc/apt/sources.list && \
    echo "deb http://archive.canonical.com/ubuntu focal partner"  >> /etc/apt/sources.list && \
    echo "deb-src http://archive.canonical.com/ubuntu focal partner"  >> /etc/apt/sources.list 


RUN apt-get update && apt-get -y build-dep \
    gstreamer1.0-libav \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly

RUN apt-get install -y \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-doc \
    gstreamer1.0-tools \
    gstreamer1.0-x \
    gstreamer1.0-alsa \
    gstreamer1.0-gl \
    gstreamer1.0-gtk3 \
    gstreamer1.0-qt5 \
    gstreamer1.0-pulseaudio

RUN apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash - && \
    sudo dpkg --configure -a && \
    printf 'y\n1\n\1n' | apt upgrade

RUN apt-get install -y aptitude && \
    aptitude install -y nodejs &&  \
    aptitude install -y npm && \
    apt install -y python3-pip

WORKDIR /app

COPY [ \
    "package.json", \
    "tsconfig.json", \
    "src/*", \
    "*.js", \
    "./" \
    ]

RUN npm install
RUN npm install typescript -g
RUN tsc
ENV DEBUG="mediasoup*"
CMD [ "node", "dist/main.js" ]
